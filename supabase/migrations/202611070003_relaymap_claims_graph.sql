-- RelayMap migration 3: claim vocabulary, graph relationships, task linkage,
-- supersession, and approval guards.
begin;

-- ---------------------------------------------------------------------------
-- 1. Claim vocabulary
-- ---------------------------------------------------------------------------
alter table public.knowledge_items
  drop constraint if exists knowledge_items_verification_status_check;
update public.knowledge_items
  set verification_status = 'APPROVED'
  where verification_status = 'VERIFIED';
alter table public.knowledge_items
  add constraint knowledge_items_verification_status_check
  check (verification_status in (
    'INFERRED','NEEDS_REVIEW','CONFLICTING','MISSING_EVIDENCE',
    'APPROVED','REJECTED','SUPERSEDED'
  ));

alter table public.knowledge_items
  drop constraint if exists knowledge_items_access_level_check;
alter table public.knowledge_items
  add constraint knowledge_items_access_level_check
  check (access_level in ('project','restricted','finance'));

alter table public.knowledge_items
  add column if not exists claim_type text not null default 'NOTE'
    check (claim_type in (
      'DECISION','TASK','OWNERSHIP','DEPENDENCY','RISK','BLOCKER',
      'QUESTION','NEXT_ACTION','MISSING_INFO','RECURRING_PROBLEM','NOTE'
    )),
  add column if not exists subject_key text,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists evidence_status text not null default 'MISSING_EVIDENCE'
    check (evidence_status in ('MISSING_EVIDENCE','PARTIAL','SUPPORTED','CONFLICTING')),
  add column if not exists superseded_by uuid references public.knowledge_items(id),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists is_synthetic boolean not null default false;

create index if not exists knowledge_project_type_status_idx
  on public.knowledge_items(project_id, claim_type, verification_status);
create index if not exists knowledge_subject_idx
  on public.knowledge_items(project_id, subject_key);

-- ---------------------------------------------------------------------------
-- 2. Relationship graph
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_claim_id uuid not null references public.knowledge_items(id) on delete cascade,
  to_claim_id uuid not null references public.knowledge_items(id) on delete cascade,
  relation text not null check (relation in (
    'SUPPORTED_BY','OWNED_BY','OWNS','WORKED_ON','DEPENDS_ON','AFFECTS',
    'SUPERSEDES','BLOCKS','BELONGS_TO','PART_OF','ABOUT','RELATES_TO'
  )),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (from_claim_id, relation, to_claim_id),
  check (from_claim_id <> to_claim_id)
);
create index if not exists rel_from_idx
  on public.knowledge_relationships(from_claim_id, relation);
create index if not exists rel_to_idx
  on public.knowledge_relationships(to_claim_id, relation);

alter table public.knowledge_relationships enable row level security;
grant select, insert, delete on public.knowledge_relationships to authenticated;

create policy "members read project relationships" on public.knowledge_relationships
  for select to authenticated using (private.can_read_project(project_id));
create policy "reviewers add relationships" on public.knowledge_relationships
  for insert to authenticated with check (
    private.can_review_project(project_id) and created_by = (select auth.uid())
  );
create policy "project leads delete relationships" on public.knowledge_relationships
  for delete to authenticated using (private.project_role(project_id) = 'lead');

-- Both claims must belong to the relationship's project.
create or replace function public.assert_relationship_project_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_project uuid;
  to_project uuid;
begin
  select project_id into from_project from public.knowledge_items where id = new.from_claim_id;
  select project_id into to_project from public.knowledge_items where id = new.to_claim_id;
  if from_project is null or to_project is null
     or from_project <> new.project_id or to_project <> new.project_id then
    raise exception 'Both claims must belong to the same project as the relationship';
  end if;
  return new;
end;
$$;
revoke all on function public.assert_relationship_project_consistency() from public, anon;
grant execute on function public.assert_relationship_project_consistency() to authenticated;

drop trigger if exists enforce_relationship_project on public.knowledge_relationships;
create trigger enforce_relationship_project
  before insert or update on public.knowledge_relationships
  for each row execute function public.assert_relationship_project_consistency();

-- Bounded recursive cycle rejection for dependency-style edges.
create or replace function public.assert_relationship_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reaches_origin boolean;
begin
  if new.relation not in ('DEPENDS_ON','SUPERSEDES','BLOCKS','PART_OF') then
    return new;
  end if;

  with recursive walk(node_id, depth) as (
    select new.to_claim_id, 0
    union all
    select r.to_claim_id, w.depth + 1
    from public.knowledge_relationships r
    join walk w on r.from_claim_id = w.node_id
    where r.relation in ('DEPENDS_ON','SUPERSEDES','BLOCKS','PART_OF')
      and w.depth < 20
  )
  select exists(select 1 from walk where node_id = new.from_claim_id)
    into reaches_origin;

  if reaches_origin then
    raise exception 'That relationship would create a cycle';
  end if;
  return new;
end;
$$;
revoke all on function public.assert_relationship_no_cycle() from public, anon;
grant execute on function public.assert_relationship_no_cycle() to authenticated;

drop trigger if exists reject_relationship_cycle on public.knowledge_relationships;
create trigger reject_relationship_cycle
  before insert or update on public.knowledge_relationships
  for each row execute function public.assert_relationship_no_cycle();

-- ---------------------------------------------------------------------------
-- 3. Task linkage
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists claim_id uuid unique
    references public.knowledge_items(id) on delete set null,
  add column if not exists blocked_reason text,
  add column if not exists completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Approval cannot happen without verified evidence
-- ---------------------------------------------------------------------------
create or replace function public.assert_approval_has_verified_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verification_status = 'APPROVED'
     and old.verification_status is distinct from 'APPROVED' then
    if not exists (
      select 1 from public.evidence_citations c
      where c.knowledge_item_id = new.id and c.verification = 'VERIFIED'
    ) then
      raise exception 'A claim can only be approved when it has verified evidence';
    end if;
    new.last_reviewed_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.assert_approval_has_verified_evidence() from public, anon;
grant execute on function public.assert_approval_has_verified_evidence() to authenticated;

drop trigger if exists require_verified_evidence_for_approval on public.knowledge_items;
create trigger require_verified_evidence_for_approval
  before update on public.knowledge_items
  for each row execute function public.assert_approval_has_verified_evidence();

create or replace function public.assert_approved_claim_keeps_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status text;
begin
  select verification_status into status
  from public.knowledge_items where id = old.knowledge_item_id;

  if status = 'APPROVED' and not exists (
    select 1 from public.evidence_citations c
    where c.knowledge_item_id = old.knowledge_item_id and c.verification = 'VERIFIED'
  ) then
    raise exception 'An approved claim cannot lose its last verified citation';
  end if;
  return old;
end;
$$;
revoke all on function public.assert_approved_claim_keeps_evidence() from public, anon;
grant execute on function public.assert_approved_claim_keeps_evidence() to authenticated;

drop trigger if exists keep_approved_claim_evidence on public.evidence_citations;
create trigger keep_approved_claim_evidence
  after delete or update of verification on public.evidence_citations
  for each row execute function public.assert_approved_claim_keeps_evidence();

-- ---------------------------------------------------------------------------
-- 5. Supersession
-- ---------------------------------------------------------------------------
-- The base review_records.action check predates the SUPERSEDED workflow, but
-- log_knowledge_review (replaced below) records 'supersede'. Widen the check so
-- the review history can record supersession instead of failing.
alter table public.review_records
  drop constraint if exists review_records_action_check;
alter table public.review_records
  add constraint review_records_action_check
  check (action in (
    'approve','reject','edit','mark_inferred','resolve_conflict',
    'request_clarification','supersede'
  ));

create or replace function public.assert_supersession_edge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.superseded_by is not null
     and new.superseded_by is distinct from old.superseded_by then
    if not exists (
      select 1 from public.knowledge_relationships r
      where r.relation = 'SUPERSEDES'
        and r.from_claim_id = new.superseded_by
        and r.to_claim_id = new.id
        and r.project_id = new.project_id
    ) then
      raise exception 'A supersession edge must exist before superseded_by is set';
    end if;
    new.verification_status := 'SUPERSEDED';
  end if;
  return new;
end;
$$;
revoke all on function public.assert_supersession_edge() from public, anon;
grant execute on function public.assert_supersession_edge() to authenticated;

drop trigger if exists enforce_supersession_edge on public.knowledge_items;
create trigger enforce_supersession_edge
  before update on public.knowledge_items
  for each row execute function public.assert_supersession_edge();

-- ---------------------------------------------------------------------------
-- 6. Replace review logging and RPCs for the new vocabulary
-- ---------------------------------------------------------------------------
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
      (select auth.uid()),
      case
        when new.verification_status = 'APPROVED' then 'approve'
        when new.verification_status = 'REJECTED' then 'reject'
        when new.verification_status = 'INFERRED' then 'mark_inferred'
        when new.verification_status = 'CONFLICTING' then 'resolve_conflict'
        when new.verification_status = 'SUPERSEDED' then 'supersede'
        else 'request_clarification'
      end,
      coalesce(new.reviewer_note,''),
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
        reviewer_id = (select auth.uid()),
        reviewer_note = nullif(trim(p_comment),''),
        updated_at = now()
    where id = p_item_id;
  return p_item_id;
end;
$$;
revoke all on function public.review_knowledge_item(uuid,text,text) from public, anon;
grant execute on function public.review_knowledge_item(uuid,text,text) to authenticated;

-- The base RPC inserted a citation without a chunk. Resolve the exact chunk
-- that contains the quotation so chunk binding holds.
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
    p_confidence, (select auth.uid())
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

commit;
