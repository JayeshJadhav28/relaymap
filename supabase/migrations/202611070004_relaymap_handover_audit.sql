-- RelayMap migration 4: immutable handover versions, acknowledgement versions,
-- interview/handover questions, readiness snapshots, and append-only audit.
begin;

-- ---------------------------------------------------------------------------
-- 1. Handover header
-- ---------------------------------------------------------------------------
alter table public.handovers
  drop constraint if exists handovers_status_check;
alter table public.handovers
  add constraint handovers_status_check
  check (status in ('draft','review','approved','published','shared','acknowledged','archived'));

alter table public.handovers
  drop constraint if exists handovers_audience_role_check;
alter table public.handovers
  add constraint handovers_audience_role_check
  check (audience_role in ('lead','reviewer','contributor','departed','incoming','viewer'));

alter table public.handovers
  add column if not exists current_version integer not null default 0
    check (current_version >= 0),
  add column if not exists approved_version_id uuid,
  add column if not exists published_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Immutable versions and version claims
-- ---------------------------------------------------------------------------
create table if not exists public.handover_versions (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  version integer not null check (version >= 1),
  audience_role text not null
    check (audience_role in ('lead','reviewer','contributor','departed','incoming','viewer')),
  body jsonb not null,
  readiness_score integer check (readiness_score between 0 and 100),
  readiness_reasons jsonb not null default '[]'::jsonb,
  content_hash text not null,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (handover_id, version),
  unique (id, handover_id)
);
create index if not exists handover_versions_handover_idx
  on public.handover_versions(handover_id, version desc);

alter table public.handovers
  add constraint handovers_approved_version_fk
  foreign key (approved_version_id) references public.handover_versions(id)
  on delete set null;

create table if not exists public.handover_version_claims (
  version_id uuid not null references public.handover_versions(id) on delete cascade,
  claim_id uuid not null references public.knowledge_items(id) on delete restrict,
  section text not null,
  position integer not null default 0,
  primary key (version_id, claim_id)
);
create index if not exists handover_version_claims_claim_idx
  on public.handover_version_claims(claim_id);

alter table public.handover_versions enable row level security;
alter table public.handover_version_claims enable row level security;
grant select, insert, update on public.handover_versions to authenticated;
grant select, insert on public.handover_version_claims to authenticated;

create policy "audience and leads read handover versions" on public.handover_versions
  for select to authenticated using (
    exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.can_read_project(h.project_id)
        and (
          private.project_role(h.project_id) = 'lead'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = h.project_id
              and pm.user_id = (select auth.uid())
              and pm.role = handover_versions.audience_role
          )
        )
    )
  );
create policy "project leads create handover versions" on public.handover_versions
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.handovers h
      where h.id = handover_id and private.project_role(h.project_id) = 'lead'
    )
  );
create policy "project leads publish handover versions" on public.handover_versions
  for update to authenticated
  using (
    exists (
      select 1 from public.handovers h
      where h.id = handover_id and private.project_role(h.project_id) = 'lead'
    )
  )
  with check (
    exists (
      select 1 from public.handovers h
      where h.id = handover_id and private.project_role(h.project_id) = 'lead'
    )
  );

create policy "audience reads version claims" on public.handover_version_claims
  for select to authenticated using (
    exists (
      select 1 from public.handover_versions v
      join public.handovers h on h.id = v.handover_id
      where v.id = version_id
        and private.can_read_project(h.project_id)
        and (
          private.project_role(h.project_id) = 'lead'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = h.project_id
              and pm.user_id = (select auth.uid())
              and pm.role = v.audience_role
          )
        )
    )
  );
create policy "project leads add version claims" on public.handover_version_claims
  for insert to authenticated with check (
    exists (
      select 1 from public.handover_versions v
      join public.handovers h on h.id = v.handover_id
      where v.id = version_id and private.project_role(h.project_id) = 'lead'
    )
  );

-- Version content is immutable. The only permitted update is stamping the
-- publication time on a previously unpublished version.
create or replace function public.reject_handover_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Published handover versions are immutable';
  end if;

  if new.id = old.id
     and new.handover_id = old.handover_id
     and new.version = old.version
     and new.audience_role = old.audience_role
     and new.body = old.body
     and new.readiness_score is not distinct from old.readiness_score
     and new.readiness_reasons = old.readiness_reasons
     and new.content_hash = old.content_hash
     and new.created_by = old.created_by
     and new.approved_by is not distinct from old.approved_by
     and new.approved_at is not distinct from old.approved_at
     and new.created_at = old.created_at
     and old.published_at is null
     and new.published_at is not null then
    return new;
  end if;

  raise exception 'Handover version content is immutable';
end;
$$;
revoke all on function public.reject_handover_version_mutation() from public, anon;
grant execute on function public.reject_handover_version_mutation() to authenticated;

drop trigger if exists protect_handover_versions on public.handover_versions;
create trigger protect_handover_versions
  before update or delete on public.handover_versions
  for each row execute function public.reject_handover_version_mutation();

-- ---------------------------------------------------------------------------
-- 3. Versioned acknowledgements
-- ---------------------------------------------------------------------------
alter table public.handover_acknowledgements
  add column if not exists version_id uuid references public.handover_versions(id)
    on delete cascade,
  add column if not exists role text,
  add column if not exists note text;

-- Remove the base single-ack-per-handover constraint regardless of its
-- generated name; acknowledgements are now per version.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.handover_acknowledgements'::regclass
      and contype = 'u'
  loop
    execute format(
      'alter table public.handover_acknowledgements drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

create unique index if not exists handover_ack_version_user_idx
  on public.handover_acknowledgements(handover_id, version_id, user_id);

create or replace function public.assert_acknowledgement_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version_id is null then
    raise exception 'An acknowledgement must reference a version';
  end if;
  if not exists (
    select 1
    from public.handover_versions v
    join public.handovers h on h.id = v.handover_id
    where v.id = new.version_id
      and h.id = new.handover_id
      and v.published_at is not null
      and h.current_version = v.version
  ) then
    raise exception 'Only the current published version of this handover can be acknowledged';
  end if;
  if new.role is null then
    select v.audience_role into new.role
    from public.handover_versions v where v.id = new.version_id;
  end if;
  return new;
end;
$$;
revoke all on function public.assert_acknowledgement_version() from public, anon;
grant execute on function public.assert_acknowledgement_version() to authenticated;

drop trigger if exists enforce_acknowledgement_version on public.handover_acknowledgements;
create trigger enforce_acknowledgement_version
  before insert on public.handover_acknowledgements
  for each row execute function public.assert_acknowledgement_version();

-- ---------------------------------------------------------------------------
-- 4. Interview questions and recipient questions
-- ---------------------------------------------------------------------------
create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  claim_id uuid references public.knowledge_items(id) on delete set null,
  question text not null check (length(question) between 8 and 1000),
  rationale text not null default '',
  status text not null default 'open' check (status in ('open','answered','dismissed')),
  answer_text text,
  answer_source_id uuid references public.sources(id) on delete set null,
  answered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists interview_project_status_idx
  on public.interview_questions(project_id, status);

alter table public.interview_questions enable row level security;
grant select, insert, update on public.interview_questions to authenticated;

create policy "members read interview questions" on public.interview_questions
  for select to authenticated using (private.can_read_project(project_id));
create policy "reviewers add interview questions" on public.interview_questions
  for insert to authenticated with check (private.can_review_project(project_id));
create policy "reviewers update interview questions" on public.interview_questions
  for update to authenticated
  using (private.can_review_project(project_id))
  with check (private.can_review_project(project_id));

create table if not exists public.handover_questions (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  version_id uuid references public.handover_versions(id) on delete set null,
  asked_by uuid not null references public.profiles(id),
  question text not null check (length(question) between 3 and 1000),
  answer text,
  status text not null default 'open' check (status in ('open','answered','escalated')),
  cited_claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

alter table public.handover_questions enable row level security;
grant select, insert, update on public.handover_questions to authenticated;

create policy "handover audience reads questions" on public.handover_questions
  for select to authenticated using (
    exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.can_read_project(h.project_id)
        and (
          private.project_role(h.project_id) = 'lead'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = h.project_id
              and pm.user_id = (select auth.uid())
              and pm.role = h.audience_role
          )
        )
    )
  );
create policy "handover audience asks questions" on public.handover_questions
  for insert to authenticated with check (
    asked_by = (select auth.uid())
    and exists (
      select 1 from public.handovers h
      where h.id = handover_id
        and private.can_read_project(h.project_id)
        and (
          private.project_role(h.project_id) = 'lead'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = h.project_id
              and pm.user_id = (select auth.uid())
              and pm.role = h.audience_role
          )
        )
    )
  );
create policy "askers update own questions" on public.handover_questions
  for update to authenticated
  using (asked_by = (select auth.uid()))
  with check (asked_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Readiness snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  handover_id uuid references public.handovers(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  components jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  computed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists readiness_project_created_idx
  on public.readiness_snapshots(project_id, created_at desc);

alter table public.readiness_snapshots enable row level security;
grant select, insert on public.readiness_snapshots to authenticated;

create policy "members read readiness snapshots" on public.readiness_snapshots
  for select to authenticated using (private.can_read_project(project_id));
create policy "reviewers record readiness snapshots" on public.readiness_snapshots
  for insert to authenticated with check (private.can_review_project(project_id));

-- ---------------------------------------------------------------------------
-- 6. Audit extension and append-only enforcement
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists request_id text;

create index if not exists audit_project_created_idx
  on public.audit_logs(project_id, created_at desc);

revoke update, delete on public.audit_logs from authenticated;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit logs are append-only';
end;
$$;
revoke all on function public.reject_audit_mutation() from public, anon;
grant execute on function public.reject_audit_mutation() to authenticated;

drop trigger if exists append_only_audit on public.audit_logs;
create trigger append_only_audit
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();

commit;
