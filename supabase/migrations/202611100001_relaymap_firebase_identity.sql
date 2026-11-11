-- RelayMap migration 7: Firebase identity bridge.
--
-- The previous six migrations are preserved byte-for-byte. Supabase remains the
-- database, but Firebase is the only end-user identity provider. Firebase UIDs
-- are strings and are not guaranteed to be UUIDs, so the database now maps a
-- verified Firebase `sub` claim to an internal app_users UUID. Every existing
-- relational reference keeps pointing at public.profiles(id), and profiles.id
-- is re-pointed at public.app_users(id) without changing any stored value.
--
-- auth.uid() is never used for application identity again: Supabase would try
-- to cast the Firebase UID to uuid. Helpers and policies use
-- public.current_app_user_id() instead.
begin;

-- ---------------------------------------------------------------------------
-- 1. Internal application identity
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique
    check (length(firebase_uid) between 1 and 128),
  email text,
  display_name text,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_users_email_idx on public.app_users(lower(email));

alter table public.app_users enable row level security;
revoke all on public.app_users from public, anon, authenticated;
grant select on public.app_users to authenticated;

-- The verified Firebase subject. Supabase validates the signature/issuer before
-- PostgreSQL sees the claims; this function only reads the verified JSON.
create or replace function public.current_firebase_uid()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    coalesce(
      auth.jwt() ->> 'sub',
      current_setting('request.jwt.claim.sub', true)
    ),
    ''
  );
$$;

-- Maps the Firebase subject to the internal UUID. SECURITY DEFINER is required
-- so policies can resolve the mapping without recursing through app_users RLS.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.app_users u
  where u.firebase_uid = public.current_firebase_uid()
  limit 1;
$$;

revoke all on function public.current_firebase_uid() from public, anon;
revoke all on function public.current_app_user_id() from public, anon;
grant execute on function public.current_firebase_uid() to authenticated;
grant execute on function public.current_app_user_id() to authenticated;

create policy "users read own app identity" on public.app_users
  for select to authenticated
  using (firebase_uid = public.current_firebase_uid());

-- ---------------------------------------------------------------------------
-- 2. Backfill existing profiles and re-point the profile foreign key
-- ---------------------------------------------------------------------------
insert into public.app_users(id, firebase_uid, email, display_name, email_verified)
select
  p.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'firebase_uid', ''), p.id::text),
  p.email,
  p.full_name,
  true
from public.profiles p
left join auth.users u on u.id = p.id
on conflict do nothing;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and confrelid = 'public.app_users'::regclass
      and contype = 'f'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references public.app_users(id) on delete cascade;
  end if;
end;
$$;

-- Supabase itself no longer creates application profiles. Firebase registration
-- is provisioned through public.provision_app_user() only after token
-- verification. Leaving the old trigger in place would abort third-party auth
-- user creation because Firebase has no username metadata.
drop trigger if exists relay_auth_user_created on auth.users;
drop function if exists private.on_auth_user_created();

-- Keep the display name in one place for both identity layers.
create or replace function private.sync_app_user_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_users
    set display_name = new.full_name,
        updated_at = now()
  where id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_app_user_display_name() from public, anon, authenticated;

drop trigger if exists sync_app_user_display_name on public.profiles;
create trigger sync_app_user_display_name
  after update of full_name on public.profiles
  for each row execute function private.sync_app_user_display_name();

-- ---------------------------------------------------------------------------
-- 3. Identity provisioning
--
-- Takes no UID, email or verification flag from the caller. Everything is read
-- from the verified JWT and the internal profile is created idempotently.
-- ---------------------------------------------------------------------------
create or replace function public.provision_app_user(p_full_name text default null)
returns public.app_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := public.current_firebase_uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_email text := lower(nullif(trim(v_claims ->> 'email'), ''));
  v_verified boolean := coalesce((v_claims ->> 'email_verified')::boolean, false);
  v_name text;
  v_user public.app_users;
  v_username text;
begin
  if v_uid is null then
    raise exception 'A verified Firebase subject is required';
  end if;

  v_name := coalesce(
    nullif(trim(p_full_name), ''),
    nullif(trim(v_claims ->> 'name'), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'RelayMap user'
  );
  v_name := left(v_name, 100);
  if length(v_name) < 2 then
    v_name := 'RelayMap user';
  end if;

  insert into public.app_users(firebase_uid, email, display_name, email_verified)
  values (v_uid, v_email, v_name, v_verified)
  on conflict (firebase_uid) do update
    set email = coalesce(excluded.email, public.app_users.email),
        display_name = case
          when excluded.display_name = 'RelayMap user' then public.app_users.display_name
          else excluded.display_name
        end,
        email_verified = excluded.email_verified,
        updated_at = now()
  returning * into v_user;

  if not exists (select 1 from public.profiles where id = v_user.id) then
    v_username := 'u_' || substr(md5(v_user.id::text), 1, 10);
    insert into public.profiles(id, full_name, username, email)
    values (
      v_user.id,
      v_user.display_name,
      v_username,
      coalesce(v_user.email, v_user.id::text || '@firebase.invalid')
    );
    insert into public.username_lookup(username, email)
    values (v_username, coalesce(v_user.email, v_user.id::text || '@firebase.invalid'))
    on conflict do nothing;
  else
    update public.profiles
      set full_name = v_user.display_name,
          email = coalesce(v_user.email, public.profiles.email),
          updated_at = now()
    where id = v_user.id;
  end if;

  return v_user;
end;
$$;
revoke all on function public.provision_app_user(text) from public, anon;
grant execute on function public.provision_app_user(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Replace every auth.uid() helper with the internal application user
-- ---------------------------------------------------------------------------
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = public.current_app_user_id()
  );
$$;

create or replace function private.org_role(p_org uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = public.current_app_user_id();
$$;

create or replace function private.org_clearance(p_org uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.clearance from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = public.current_app_user_id();
$$;

create or replace function private.project_role(p_project uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (
      select pm.role from public.project_members pm
      where pm.project_id = p_project
        and pm.user_id = public.current_app_user_id()
    ),
    (
      select case m.role
               when 'admin' then 'lead'
               when 'manager' then 'lead'
               when 'viewer' then 'viewer'
               else 'contributor'
             end
      from public.projects p
      join public.organization_members m on m.organization_id = p.organization_id
      where p.id = p_project
        and m.user_id = public.current_app_user_id()
    )
  );
$$;

create or replace function private.can_read_project(p_project uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.project_role(p_project) is not null; $$;

create or replace function private.can_review_project(p_project uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.project_role(p_project) in ('lead','reviewer'); $$;

create or replace function private.can_contribute_project(p_project uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.project_role(p_project) in ('lead','reviewer','contributor'); $$;

create or replace function private.can_read_source(p_source uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1
    from public.sources s
    join public.projects p on p.id = s.project_id
    where s.id = p_source
      and private.can_read_project(s.project_id)
      and (
        s.access_level = 'project'
        or private.project_role(s.project_id) = 'lead'
        or private.org_clearance(p.organization_id) = 'finance'
      )
  );
$$;

create or replace function private.can_read_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1
    from public.knowledge_items k
    join public.projects p on p.id = k.project_id
    where k.id = p_claim
      and private.can_read_project(k.project_id)
      and (
        k.access_level = 'project'
        or private.project_role(k.project_id) = 'lead'
        or private.org_clearance(p.organization_id) = 'finance'
      )
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.org_role(uuid) from public, anon;
revoke all on function private.org_clearance(uuid) from public, anon;
revoke all on function private.project_role(uuid) from public, anon;
revoke all on function private.can_read_project(uuid) from public, anon;
revoke all on function private.can_review_project(uuid) from public, anon;
revoke all on function private.can_contribute_project(uuid) from public, anon;
revoke all on function private.can_read_source(uuid) from public, anon;
revoke all on function private.can_read_claim(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.org_role(uuid) to authenticated;
grant execute on function private.org_clearance(uuid) to authenticated;
grant execute on function private.project_role(uuid) to authenticated;
grant execute on function private.can_read_project(uuid) to authenticated;
grant execute on function private.can_review_project(uuid) to authenticated;
grant execute on function private.can_contribute_project(uuid) to authenticated;
grant execute on function private.can_read_source(uuid) to authenticated;
grant execute on function private.can_read_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rewrite every policy that still reads auth.uid()
--
-- PostgreSQL stores policy expressions as text, so this rewrites the stored
-- USING / WITH CHECK expressions without dropping policy grants or commands.
-- Only the public application schema is touched.
-- ---------------------------------------------------------------------------
do $$
declare
  policy record;
  new_qual text;
  new_check text;
begin
  for policy in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    new_qual := replace(policy.qual, 'auth.uid()', 'public.current_app_user_id()');
    new_check := replace(policy.with_check, 'auth.uid()', 'public.current_app_user_id()');

    if new_qual is not null and new_check is not null then
      execute format(
        'alter policy %I on public.%I using (%s) with check (%s)',
        policy.policyname, policy.tablename, new_qual, new_check
      );
    elsif new_qual is not null then
      execute format(
        'alter policy %I on public.%I using (%s)',
        policy.policyname, policy.tablename, new_qual
      );
    elsif new_check is not null then
      execute format(
        'alter policy %I on public.%I with check (%s)',
        policy.policyname, policy.tablename, new_check
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Replace auth.uid() in functions and triggers
-- ---------------------------------------------------------------------------
create or replace function public.validate_chunk_citation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  chunk_content text;
  chunk_page integer;
  chunk_source uuid;
  chunk_project uuid;
  claim_project uuid;
  source_project uuid;
begin
  select c.content, c.page_number, c.source_id, c.project_id
    into chunk_content, chunk_page, chunk_source, chunk_project
  from public.source_chunks c
  where c.id = new.chunk_id;

  if chunk_content is null then raise exception 'The cited chunk does not exist'; end if;
  if chunk_source <> new.source_id then
    raise exception 'The cited chunk belongs to a different source';
  end if;

  select project_id into claim_project
  from public.knowledge_items where id = new.knowledge_item_id;
  select project_id into source_project
  from public.sources where id = new.source_id;

  if claim_project is null or source_project is null
     or claim_project <> source_project
     or chunk_project <> claim_project then
    raise exception 'Claim, source and chunk must belong to the same project';
  end if;

  if position(new.exact_snippet in chunk_content) = 0 then
    raise exception 'Evidence excerpt must exactly match the cited chunk';
  end if;

  if new.page_number is not null
     and chunk_page is not null
     and new.page_number <> chunk_page then
    raise exception 'Citation page does not match the cited chunk';
  end if;

  new.verification := 'VERIFIED';
  new.verified_at := now();
  new.verified_by := public.current_app_user_id();
  new.quote_hash := 'sha256:' || encode(pg_catalog.sha256(convert_to(new.exact_snippet, 'UTF8')), 'hex');
  new.failure_reason := null;
  return new;
end;
$$;
revoke all on function public.validate_chunk_citation() from public, anon;
grant execute on function public.validate_chunk_citation() to authenticated;

create or replace function public.log_knowledge_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verification_status is distinct from old.verification_status then
    insert into public.review_records(
      knowledge_item_id, reviewer_id, action, comment, prior_status, next_status
    ) values (
      new.id,
      public.current_app_user_id(),
      case
        when new.verification_status = 'APPROVED' then 'approve'
        when new.verification_status = 'REJECTED' then 'reject'
        when new.verification_status = 'INFERRED' then 'mark_inferred'
        when new.verification_status = 'CONFLICTING' then 'resolve_conflict'
        when new.verification_status = 'SUPERSEDED' then 'supersede'
        else 'request_clarification'
      end,
      coalesce(new.reviewer_note, ''),
      old.verification_status,
      new.verification_status
    );
  end if;
  return new;
end;
$$;
revoke all on function public.log_knowledge_review() from public, anon;
grant execute on function public.log_knowledge_review() to authenticated;

create or replace function public.review_knowledge_item(
  p_item_id uuid,
  p_status text,
  p_comment text default ''
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  prior text;
begin
  select verification_status into prior
  from public.knowledge_items where id = p_item_id;

  if prior is null then raise exception 'Knowledge item not found or inaccessible'; end if;
  if p_status not in (
    'INFERRED','NEEDS_REVIEW','CONFLICTING','MISSING_EVIDENCE',
    'APPROVED','REJECTED','SUPERSEDED'
  ) then
    raise exception 'Unknown verification status';
  end if;
  if p_status = 'APPROVED' and not exists (
    select 1 from public.evidence_citations c
    where c.knowledge_item_id = p_item_id and c.verification = 'VERIFIED'
  ) then
    raise exception 'Approved knowledge requires verified evidence';
  end if;

  update public.knowledge_items
    set verification_status = p_status,
        reviewer_id = public.current_app_user_id(),
        reviewer_note = nullif(trim(p_comment), ''),
        updated_at = now()
    where id = p_item_id;
  return p_item_id;
end;
$$;
revoke all on function public.review_knowledge_item(uuid,text,text) from public, anon;
grant execute on function public.review_knowledge_item(uuid,text,text) to authenticated;

create or replace function public.add_evidence_knowledge(
  p_project_id uuid,
  p_title text,
  p_category text,
  p_description text,
  p_status text,
  p_confidence numeric,
  p_source_id uuid,
  p_exact_snippet text,
  p_source_location text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_item_id uuid;
  target_chunk uuid;
begin
  select c.id into target_chunk
  from public.source_chunks c
  where c.source_id = p_source_id
    and position(p_exact_snippet in c.content) > 0
  order by c.chunk_index
  limit 1;

  if target_chunk is null then
    raise exception 'Evidence excerpt must exactly match a chunk of the cited source';
  end if;
  if p_status = 'APPROVED' then
    raise exception 'Evidence must be verified before a claim is approved';
  end if;

  insert into public.knowledge_items(
    project_id, title, category, description, verification_status,
    confidence_score, created_by
  ) values (
    p_project_id, trim(p_title), p_category, p_description, p_status,
    p_confidence, public.current_app_user_id()
  ) returning id into new_item_id;

  insert into public.evidence_citations(
    knowledge_item_id, source_id, chunk_id, exact_snippet, source_location
  ) values (
    new_item_id, p_source_id, target_chunk, p_exact_snippet, p_source_location
  );
  return new_item_id;
end;
$$;
revoke all on function public.add_evidence_knowledge(uuid,text,text,text,text,numeric,uuid,text,text) from public, anon;
grant execute on function public.add_evidence_knowledge(uuid,text,text,text,text,numeric,uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Atomic organisation/project creation for the real workspace
-- ---------------------------------------------------------------------------
create or replace function private.assert_verified_application_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.current_app_user_id();
begin
  if v_id is null then
    raise exception 'No application identity is provisioned';
  end if;
  if not exists (
    select 1 from public.app_users u
    where u.id = v_id and u.email_verified
  ) then
    raise exception 'Email verification is required';
  end if;
  return v_id;
end;
$$;
revoke all on function private.assert_verified_application_user() from public, anon, authenticated;

create or replace function public.create_organization_for_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  v_user uuid := private.assert_verified_application_user();
begin
  if length(trim(p_name)) < 2 then raise exception 'Organisation name is too short'; end if;
  insert into public.organizations(name, created_by)
    values (trim(p_name), v_user)
    returning id into new_org_id;
  insert into public.organization_members(organization_id, user_id, role, clearance)
    values (new_org_id, v_user, 'admin', 'standard');
  return new_org_id;
end;
$$;
revoke all on function public.create_organization_for_owner(text) from public, anon;
grant execute on function public.create_organization_for_owner(text) to authenticated;

create or replace function public.create_project_for_owner(
  p_organization_id uuid,
  p_name text,
  p_description text default ''
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_project_id uuid;
  v_user uuid := private.assert_verified_application_user();
begin
  insert into public.projects(organization_id, name, description, owner_id)
    values (p_organization_id, trim(p_name), coalesce(p_description, ''), v_user)
    returning id into new_project_id;
  insert into public.project_members(project_id, user_id, role)
    values (new_project_id, v_user, 'lead');
  return new_project_id;
end;
$$;
revoke all on function public.create_project_for_owner(uuid,text,text) from public, anon;
grant execute on function public.create_project_for_owner(uuid,text,text) to authenticated;

create or replace function public.bootstrap_workspace(
  p_organization_name text,
  p_project_name text,
  p_project_description text default ''
)
returns table (organization_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_project uuid;
  v_user uuid := private.assert_verified_application_user();
begin
  if length(trim(p_organization_name)) < 2 then
    raise exception 'Organisation name is too short';
  end if;
  if length(trim(p_project_name)) < 2 then
    raise exception 'Project name is too short';
  end if;

  insert into public.organizations(name, created_by)
    values (trim(p_organization_name), v_user)
    returning id into v_org;

  insert into public.organization_members(organization_id, user_id, role, clearance)
    values (v_org, v_user, 'admin', 'standard');

  insert into public.projects(organization_id, name, description, owner_id)
    values (v_org, trim(p_project_name), coalesce(p_project_description, ''), v_user)
    returning id into v_project;

  insert into public.project_members(project_id, user_id, role)
    values (v_project, v_user, 'lead');

  return query select v_org, v_project;
end;
$$;
revoke all on function public.bootstrap_workspace(text,text,text) from public, anon;
grant execute on function public.bootstrap_workspace(text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Invitation acceptance
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

  insert into public.organization_members(organization_id, user_id, role, clearance)
  values (
    v_invitation.organization_id, v_user, v_invitation.role, v_invitation.clearance
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        clearance = excluded.clearance,
        updated_at = now();

  update public.invitations
    set accepted_by = v_user, accepted_at = now()
  where id = v_invitation.id;

  insert into public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_invitation.organization_id, v_user, 'invitation.accepted', 'invitation',
    v_invitation.id, jsonb_build_object('role', v_invitation.role)
  );

  return v_invitation.organization_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

commit;
