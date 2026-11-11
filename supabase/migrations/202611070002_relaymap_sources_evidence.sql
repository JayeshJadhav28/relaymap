-- RelayMap migration 2: source metadata, immutable chunks, and chunk-bound
-- evidence verification.
begin;

-- ---------------------------------------------------------------------------
-- 1. Source metadata
-- ---------------------------------------------------------------------------
alter table public.sources
  drop constraint if exists sources_source_type_check;
alter table public.sources
  add constraint sources_source_type_check
  check (source_type in (
    'github','csv','json','markdown','text','txt','md','pdf','docx','meeting','chat','task_board','interview'
  ));

alter table public.sources
  drop constraint if exists sources_access_level_check;
alter table public.sources
  add constraint sources_access_level_check
  check (access_level in ('project','restricted','finance'));

alter table public.sources
  add column if not exists content_hash text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint
    check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 10485760)),
  add column if not exists storage_path text,
  add column if not exists page_count integer
    check (page_count is null or page_count >= 0),
  add column if not exists extraction_status text not null default 'pending'
    check (extraction_status in ('pending','parsing','parsed','failed')),
  add column if not exists extraction_error text,
  add column if not exists ai_allowed boolean not null default false,
  add column if not exists is_synthetic boolean not null default false,
  add column if not exists updated_by uuid references public.profiles(id);

-- ---------------------------------------------------------------------------
-- 2. Source chunks
-- ---------------------------------------------------------------------------
create table if not exists public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number is null or page_number >= 1),
  section_title text,
  content text not null check (length(content) between 1 and 20000),
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end > char_start),
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index),
  unique (source_id, content_hash, chunk_index),
  check (char_end - char_start <= 20000)
);
create index if not exists source_chunks_source_idx
  on public.source_chunks(source_id, chunk_index);
create index if not exists source_chunks_project_page_idx
  on public.source_chunks(project_id, page_number);

alter table public.source_chunks enable row level security;
grant select, insert on public.source_chunks to authenticated;

create policy "read chunks of readable sources" on public.source_chunks
  for select to authenticated using (private.can_read_source(source_id));
create policy "contributors add chunks" on public.source_chunks
  for insert to authenticated with check (
    private.can_contribute_project(project_id)
    and exists (
      select 1 from public.sources s
      where s.id = source_id and s.project_id = source_chunks.project_id
    )
  );

-- A chunk can never point at a different project than its source.
create or replace function public.assert_chunk_project_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare source_project uuid;
begin
  select project_id into source_project from public.sources where id = new.source_id;
  if source_project is null or source_project <> new.project_id then
    raise exception 'A source chunk must belong to the same project as its source';
  end if;
  return new;
end;
$$;
revoke all on function public.assert_chunk_project_consistency() from public, anon;
grant execute on function public.assert_chunk_project_consistency() to authenticated;
drop trigger if exists enforce_chunk_project on public.source_chunks;
create trigger enforce_chunk_project
  before insert or update on public.source_chunks
  for each row execute function public.assert_chunk_project_consistency();

-- ---------------------------------------------------------------------------
-- 3. Citation metadata
-- ---------------------------------------------------------------------------
alter table public.evidence_citations
  add column if not exists chunk_id uuid references public.source_chunks(id) on delete restrict,
  add column if not exists page_number integer
    check (page_number is null or page_number >= 1),
  add column if not exists char_start integer
    check (char_start is null or char_start >= 0),
  add column if not exists char_end integer
    check (char_end is null or char_end > char_start),
  add column if not exists quote_hash text,
  add column if not exists verification text not null default 'PENDING'
    check (verification in ('PENDING','VERIFIED','FAILED')),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists failure_reason text;

create index if not exists evidence_chunk_idx
  on public.evidence_citations(chunk_id);
create index if not exists evidence_unverified_idx
  on public.evidence_citations(verification)
  where verification <> 'VERIFIED';

-- Backfill legacy whole-blob citations with one exact full-content chunk.
do $$
declare
  src record;
  new_chunk_id uuid;
begin
  for src in
    select distinct s.id, s.project_id, s.content
    from public.sources s
    join public.evidence_citations c on c.source_id = s.id
    where c.chunk_id is null
  loop
    if length(src.content) = 0 then
      raise exception 'Cannot backfill a citation for empty source %', src.id;
    end if;
    insert into public.source_chunks(
      source_id, project_id, chunk_index, page_number, section_title,
      content, char_start, char_end, content_hash
    ) values (
      src.id, src.project_id, 0, null, 'Legacy source',
      left(src.content, 20000), 0, length(left(src.content, 20000)),
      'sha256:' || encode(pg_catalog.sha256(convert_to(left(src.content, 20000), 'UTF8')), 'hex')
    )
    on conflict (source_id, chunk_index) do update set content = excluded.content
    returning id into new_chunk_id;

    update public.evidence_citations
      set chunk_id = new_chunk_id
      where source_id = src.id and chunk_id is null;
  end loop;
end;
$$;

alter table public.evidence_citations
  alter column chunk_id set not null;

-- ---------------------------------------------------------------------------
-- 4. Chunk-bound exact-quote verification
--
-- The trigger is authoritative. Application checks exist only to produce
-- better error messages and to avoid unnecessary writes.
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

  if chunk_content is null then
    raise exception 'The cited chunk does not exist';
  end if;
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
  new.verified_by := (select auth.uid());
  new.quote_hash := 'sha256:' || encode(pg_catalog.sha256(convert_to(new.exact_snippet, 'UTF8')), 'hex');
  new.failure_reason := null;
  return new;
end;
$$;
revoke all on function public.validate_chunk_citation() from public, anon;
grant execute on function public.validate_chunk_citation() to authenticated;

drop trigger if exists validate_citation_excerpt on public.evidence_citations;
drop trigger if exists validate_chunk_citation_trigger on public.evidence_citations;
create trigger validate_chunk_citation_trigger
  before insert or update on public.evidence_citations
  for each row execute function public.validate_chunk_citation();

-- ---------------------------------------------------------------------------
-- 5. Reapply the approval guard now that evidence_citations.verification exists
-- ---------------------------------------------------------------------------
-- The trigger above rejects any citation that is not an exact chunk-bound
-- quote and stamps it VERIFIED, so this policy makes the invariant explicit.
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
          and c.verification = 'VERIFIED'
      )
    )
  );

commit;
