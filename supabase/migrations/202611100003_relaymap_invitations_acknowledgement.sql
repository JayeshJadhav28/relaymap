-- RelayMap migration 9: project-scoped invitations and acknowledgement policy
-- hardening.
--
-- 1. Organisation invitations can now carry an optional project assignment.
--    Without this, the `incoming` project role could never be granted through
--    the product, so a real recipient could never acknowledge a published
--    handover. The organisation role remains the roster authority; the project
--    role is an additional, narrowly scoped grant.
--
-- 2. Re-assert the acknowledgement policies against the project-role model.
--    The foundation policy compared organisation_members.role (now
--    admin|manager|member|viewer) with handovers.audience_role (a project
--    role), which silently blocked every receipt. The policies below compare
--    project roles and expose receipts to the project lead.
begin;

-- ---------------------------------------------------------------------------
-- 1. Optional project scope on an invitation
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists project_role text;

alter table public.invitations
  drop constraint if exists invitations_project_role_check;
alter table public.invitations
  add constraint invitations_project_role_check
  check (
    project_role is null
    or project_role in ('lead','reviewer','contributor','departed','incoming','viewer')
  );

alter table public.invitations
  drop constraint if exists invitations_project_pair_check;
alter table public.invitations
  add constraint invitations_project_pair_check
  check ((project_id is null) = (project_role is null));

create index if not exists invitations_project_idx
  on public.invitations(project_id)
  where project_id is not null;

-- The invitation may only name a project inside its own organisation. This is
-- enforced on direct inserts (RLS) and again inside acceptance (definer RPC).
drop policy if exists "admins create invitations" on public.invitations;
create policy "admins create invitations" on public.invitations
  for insert to authenticated
  with check (
    invited_by = public.current_app_user_id()
    and private.org_role(organization_id) in ('admin','manager')
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and p.organization_id = invitations.organization_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Acceptance adds both memberships, still deciding roles server-side
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.assert_verified_application_user();
  v_email text;
  v_hash text;
  v_invitation public.invitations;
begin
  if length(coalesce(p_token, '')) < 16 then
    raise exception 'Invitation token is invalid';
  end if;

  select lower(email) into v_email from public.app_users where id = v_user;
  v_hash := encode(pg_catalog.sha256(convert_to(p_token, 'UTF8')), 'hex');

  select * into v_invitation
  from public.invitations i
  where i.token_hash = v_hash
  for update;

  if v_invitation.id is null then raise exception 'Invitation not found'; end if;
  if v_invitation.accepted_at is not null then raise exception 'Invitation has already been used'; end if;
  if v_invitation.expires_at < now() then raise exception 'Invitation has expired'; end if;
  if v_email is null or v_email <> v_invitation.email then
    raise exception 'Invitation belongs to a different email address';
  end if;
  if v_invitation.project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = v_invitation.project_id
      and p.organization_id = v_invitation.organization_id
  ) then
    raise exception 'Invitation project does not belong to the organisation';
  end if;

  insert into public.organization_members(organization_id, user_id, role, clearance)
  values (
    v_invitation.organization_id, v_user, v_invitation.role, v_invitation.clearance
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        clearance = excluded.clearance,
        updated_at = now();

  if v_invitation.project_id is not null then
    insert into public.project_members(project_id, user_id, role, joined_at)
    values (v_invitation.project_id, v_user, v_invitation.project_role, now())
    on conflict (project_id, user_id) do update
      set role = excluded.role,
          updated_at = now();
  end if;

  update public.invitations
    set accepted_by = v_user, accepted_at = now()
  where id = v_invitation.id;

  insert into public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_invitation.organization_id, v_user, 'invitation.accepted', 'invitation',
    v_invitation.id,
    jsonb_build_object(
      'role', v_invitation.role,
      'project_role', v_invitation.project_role
    )
  );

  return v_invitation.organization_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Acknowledgement policies: compare project roles, not organisation roles
-- ---------------------------------------------------------------------------
drop policy if exists "recipients acknowledge published handovers"
  on public.handover_acknowledgements;
drop policy if exists "recipient acknowledges handover"
  on public.handover_acknowledgements;
create policy "recipients acknowledge published handovers"
  on public.handover_acknowledgements
  for insert to authenticated
  with check (
    user_id = public.current_app_user_id()
    and exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and h.status in ('published','shared','acknowledged')
        and private.project_role(h.project_id) = h.audience_role
    )
  );

drop policy if exists "recipients and leads read acknowledgements"
  on public.handover_acknowledgements;
drop policy if exists "users read own acknowledgements"
  on public.handover_acknowledgements;
create policy "recipients and leads read acknowledgements"
  on public.handover_acknowledgements
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.project_role(h.project_id) = 'lead'
    )
  );

commit;
