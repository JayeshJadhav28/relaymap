-- RelayMap migration 2: organisation/project role model, invitations, and the
-- role-aware policy layer used by every later migration.
--
-- The foundation migration shipped a single flat role vocabulary
-- (lead/member/treasurer/incoming) on both organisation and project
-- membership. RelayMap separates the two:
--
--   organisation roles  admin | manager | member | viewer   (roster authority)
--   project roles       lead | reviewer | contributor | departed | incoming | viewer
--
-- Finance access is a clearance on the organisation membership, not a role, so
-- a reviewer can hold finance clearance without gaining project-lead rights.
--
-- All helpers are SECURITY DEFINER so policies can resolve membership without
-- recursing through the very RLS policies that call them. At this point the
-- acting identity is still Supabase auth.uid(); migration 9 (Firebase identity)
-- replaces every helper body and every stored policy expression that mentions
-- auth.uid() with public.current_app_user_id().
begin;

-- ---------------------------------------------------------------------------
-- 1. Organisation membership: new role vocabulary and finance clearance
-- ---------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists clearance text not null default 'standard',
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('admin','manager','member','viewer'));

alter table public.organization_members
  drop constraint if exists organization_members_clearance_check;
alter table public.organization_members
  add constraint organization_members_clearance_check
  check (clearance in ('standard','finance'));

create index if not exists organization_members_user_idx
  on public.organization_members(user_id, organization_id);

-- ---------------------------------------------------------------------------
-- 2. Project membership: project roles replace the flat vocabulary
-- ---------------------------------------------------------------------------
alter table public.project_members
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists joined_at timestamptz not null default now();

alter table public.project_members
  drop constraint if exists project_members_role_check;
alter table public.project_members
  add constraint project_members_role_check
  check (role in ('lead','reviewer','contributor','departed','incoming','viewer'));

create index if not exists project_members_user_idx
  on public.project_members(user_id, project_id);

-- Handovers address a project role. The foundation constraint only knew the
-- flat vocabulary, so widen it here for real-project handovers.
alter table public.handovers
  drop constraint if exists handovers_audience_role_check;
alter table public.handovers
  add constraint handovers_audience_role_check
  check (audience_role in ('lead','reviewer','contributor','departed','incoming','viewer'));

-- ---------------------------------------------------------------------------
-- 3. Invitations
--
-- Only the SHA-256 hash of the single-use token is stored. The plaintext token
-- is returned once by the application and never persisted. Acceptance is an
-- RPC that reads the verified session email; a client can never choose which
-- address or role it receives.
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  role text not null check (role in ('admin','manager','member','viewer')),
  clearance text not null default 'standard'
    check (clearance in ('standard','finance')),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or accepted_by is not null)
);
create index if not exists invitations_org_created_idx
  on public.invitations(organization_id, created_at desc);
create index if not exists invitations_email_idx
  on public.invitations(lower(email));

alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;
grant select, insert, delete on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membership helpers
--
-- Every helper is SECURITY DEFINER and pinned to an empty search_path so a
-- caller cannot shadow a relation or function name. They read the acting
-- identity from auth.uid() at this layer; migration 9 re-points them at the
-- internal Firebase-mapped identity.
-- ---------------------------------------------------------------------------
create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.org_role(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = (select auth.uid());
$$;

create or replace function private.org_clearance(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.clearance from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = (select auth.uid());
$$;

-- Project role resolution order:
--   1. an explicit project_members row wins;
--   2. otherwise the organisation role carries an implied project role:
--      admin/manager -> lead, viewer -> viewer, member -> contributor.
create or replace function private.project_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select pm.role from public.project_members pm
      where pm.project_id = p_project
        and pm.user_id = (select auth.uid())
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
        and m.user_id = (select auth.uid())
    )
  );
$$;

create or replace function private.can_read_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.project_role(p_project) is not null;
$$;

create or replace function private.can_review_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.project_role(p_project) in ('lead','reviewer');
$$;

create or replace function private.can_contribute_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.project_role(p_project) in ('lead','reviewer','contributor');
$$;

-- A finance source is readable by the project lead or by any member of the
-- owning organisation who holds finance clearance.
create or replace function private.can_read_source(p_source uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
returns boolean
language sql
stable
security definer
set search_path = ''
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
-- 5. Replace every foundation policy that encoded the flat role vocabulary
-- ---------------------------------------------------------------------------
drop policy if exists "members read own organizations" on public.organizations;
create policy "members read their organisations" on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

drop policy if exists "members read own membership" on public.organization_members;
create policy "members read the organisation roster" on public.organization_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('admin','manager')
  );

drop policy if exists "org members read projects" on public.projects;
create policy "members read projects" on public.projects
  for select to authenticated
  using (private.can_read_project(id));

drop policy if exists "leads create projects" on public.projects;
create policy "workspace managers create projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.org_role(organization_id) in ('admin','manager')
  );

drop policy if exists "leads update projects" on public.projects;
create policy "workspace managers update projects" on public.projects
  for update to authenticated
  using (
    private.org_role(organization_id) in ('admin','manager')
    or private.project_role(id) = 'lead'
  )
  with check (
    private.org_role(organization_id) in ('admin','manager')
    or private.project_role(id) = 'lead'
  );

drop policy if exists "leads delete projects" on public.projects;
create policy "workspace managers delete projects" on public.projects
  for delete to authenticated
  using (
    private.org_role(organization_id) in ('admin','manager')
    or private.project_role(id) = 'lead'
  );

drop policy if exists "members read project roster" on public.project_members;
create policy "members read the project roster" on public.project_members
  for select to authenticated
  using (private.can_read_project(project_id));

drop policy if exists "leads add project members" on public.project_members;
create policy "project leads add members" on public.project_members
  for insert to authenticated
  with check (private.project_role(project_id) = 'lead');

drop policy if exists "leads remove project members" on public.project_members;
create policy "project leads remove members" on public.project_members
  for delete to authenticated
  using (private.project_role(project_id) = 'lead');

drop policy if exists "read permitted sources" on public.sources;
create policy "members read permitted sources" on public.sources
  for select to authenticated
  using (private.can_read_source(id));

drop policy if exists "members add permitted sources" on public.sources;
create policy "contributors add permitted sources" on public.sources
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.can_contribute_project(project_id)
    and (
      access_level = 'project'
      or private.project_role(project_id) = 'lead'
      or private.org_clearance(
           (select p.organization_id from public.projects p where p.id = project_id)
         ) = 'finance'
    )
  );

drop policy if exists "leads manage sources" on public.sources;
create policy "project leads manage sources" on public.sources
  for update to authenticated
  using (private.project_role(project_id) = 'lead')
  with check (
    access_level = 'project'
    or private.project_role(project_id) = 'lead'
    or private.org_clearance(
         (select p.organization_id from public.projects p where p.id = project_id)
       ) = 'finance'
  );

drop policy if exists "leads delete sources" on public.sources;
create policy "project leads delete sources" on public.sources
  for delete to authenticated
  using (private.project_role(project_id) = 'lead');

drop policy if exists "read scoped knowledge" on public.knowledge_items;
create policy "members read accessible claims" on public.knowledge_items
  for select to authenticated
  using (private.can_read_claim(id));

drop policy if exists "members propose unverified knowledge" on public.knowledge_items;
create policy "contributors propose unverified claims" on public.knowledge_items
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and verification_status <> 'VERIFIED'
    and private.can_contribute_project(project_id)
    and (
      access_level = 'project'
      or private.project_role(project_id) = 'lead'
      or private.org_clearance(
           (select p.organization_id from public.projects p where p.id = project_id)
         ) = 'finance'
    )
  );

-- Later migrations replace this policy to add the evidence invariant; keeping
-- the same name means their drop/create pair remains idempotent.
drop policy if exists "reviewers update knowledge" on public.knowledge_items;
drop policy if exists "reviewers update claims" on public.knowledge_items;
create policy "reviewers update claims" on public.knowledge_items
  for update to authenticated
  using (private.can_review_project(project_id))
  with check (
    private.can_review_project(project_id)
    and reviewer_id = (select auth.uid())
    and (
      verification_status <> 'APPROVED'
      or exists (
        select 1 from public.evidence_citations c
        where c.knowledge_item_id = knowledge_items.id
      )
    )
  );

drop policy if exists "leads delete knowledge" on public.knowledge_items;
create policy "project leads delete claims" on public.knowledge_items
  for delete to authenticated
  using (private.project_role(project_id) = 'lead');

drop policy if exists "read citation when both records readable" on public.evidence_citations;
create policy "members read citations of readable records" on public.evidence_citations
  for select to authenticated
  using (
    private.can_read_source(source_id)
    and private.can_read_claim(knowledge_item_id)
  );

drop policy if exists "reviewers add same project evidence" on public.evidence_citations;
create policy "contributors add same project evidence" on public.evidence_citations
  for insert to authenticated
  with check (
    private.can_contribute_project(
      (select k.project_id from public.knowledge_items k where k.id = knowledge_item_id)
    )
    and exists (
      select 1
      from public.knowledge_items k
      join public.sources s on s.project_id = k.project_id
      where k.id = evidence_citations.knowledge_item_id
        and s.id = evidence_citations.source_id
    )
  );

drop policy if exists "members read tasks" on public.tasks;
create policy "members read project tasks" on public.tasks
  for select to authenticated
  using (private.can_read_project(project_id));

drop policy if exists "members manage tasks" on public.tasks;
create policy "contributors manage project tasks" on public.tasks
  for all to authenticated
  using (private.can_contribute_project(project_id))
  with check (private.can_contribute_project(project_id));

-- Handovers address a project role. A recipient only sees a handover once it is
-- published; a project lead sees drafts and every audience.
drop policy if exists "read role audience handovers" on public.handovers;
create policy "audience reads published handovers" on public.handovers
  for select to authenticated
  using (
    private.can_read_project(project_id)
    and (
      private.project_role(project_id) = 'lead'
      or (
        private.project_role(project_id) = audience_role
        and status in ('published','shared','acknowledged')
      )
    )
  );

drop policy if exists "leads create handovers" on public.handovers;
create policy "project leads create handovers" on public.handovers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.project_role(project_id) = 'lead'
  );

drop policy if exists "leads update handovers" on public.handovers;
create policy "project leads update handovers" on public.handovers
  for update to authenticated
  using (private.project_role(project_id) = 'lead')
  with check (private.project_role(project_id) = 'lead');

create policy "project leads delete handovers" on public.handovers
  for delete to authenticated
  using (private.project_role(project_id) = 'lead');

grant select, insert, update, delete on public.handovers to authenticated;

drop policy if exists "recipient acknowledges handover" on public.handover_acknowledgements;
create policy "recipients acknowledge published handovers" on public.handover_acknowledgements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.project_role(h.project_id) = h.audience_role
    )
  );

drop policy if exists "users read own acknowledgements" on public.handover_acknowledgements;
create policy "recipients and leads read acknowledgements" on public.handover_acknowledgements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.project_role(h.project_id) = 'lead'
    )
  );

drop policy if exists "members read review history" on public.review_records;
create policy "members read review history of accessible claims" on public.review_records
  for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_items k
      where k.id = knowledge_item_id
        and private.can_read_claim(k.id)
    )
  );

drop policy if exists "reviewers append review history" on public.review_records;
create policy "reviewers append review history" on public.review_records
  for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and exists (
      select 1 from public.knowledge_items k
      where k.id = knowledge_item_id
        and private.can_review_project(k.project_id)
    )
  );

drop policy if exists "members read audit logs" on public.audit_logs;
create policy "members read organisation audit logs" on public.audit_logs
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists "members append own audit logs" on public.audit_logs;
create policy "members append own audit logs" on public.audit_logs
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 6. Invitation policies: only organisation admins and managers
-- ---------------------------------------------------------------------------
create policy "admins read invitations" on public.invitations
  for select to authenticated
  using (private.org_role(organization_id) in ('admin','manager'));

create policy "admins create invitations" on public.invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and private.org_role(organization_id) in ('admin','manager')
  );

create policy "admins revoke invitations" on public.invitations
  for delete to authenticated
  using (private.org_role(organization_id) in ('admin','manager'));

commit;
