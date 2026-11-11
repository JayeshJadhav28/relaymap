-- RelayMap migration 5: GitHub connections and server-only AI run records.
begin;

-- ---------------------------------------------------------------------------
-- 1. GitHub connections (token ciphertext is never selectable by clients)
-- ---------------------------------------------------------------------------
create table if not exists public.github_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('oauth','app')),
  encrypted_token text not null,
  token_hint text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists github_connections_user_idx
  on public.github_connections(user_id, created_at desc);

alter table public.github_connections enable row level security;

-- Column grants deliberately exclude encrypted_token.
grant select (id, user_id, organization_id, provider, token_hint, scopes, created_at, revoked_at)
  on public.github_connections to authenticated;
revoke insert, update, delete on public.github_connections from authenticated;

create policy "owners read own github connections" on public.github_connections
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Repositories
-- ---------------------------------------------------------------------------
create table if not exists public.github_repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner text not null,
  name text not null,
  repo_url text not null,
  default_branch text,
  private boolean not null default false,
  connected_by uuid not null references public.profiles(id),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, repo_url)
);
create index if not exists github_repo_project_idx
  on public.github_repositories(project_id);

alter table public.github_repositories enable row level security;
grant select, insert, update, delete on public.github_repositories to authenticated;

create policy "members read linked repositories" on public.github_repositories
  for select to authenticated using (private.can_read_project(project_id));
create policy "project leads link repositories" on public.github_repositories
  for insert to authenticated with check (
    connected_by = (select auth.uid()) and private.project_role(project_id) = 'lead'
  );
create policy "project leads update repositories" on public.github_repositories
  for update to authenticated
  using (private.project_role(project_id) = 'lead')
  with check (private.project_role(project_id) = 'lead');
create policy "project leads unlink repositories" on public.github_repositories
  for delete to authenticated using (private.project_role(project_id) = 'lead');

-- ---------------------------------------------------------------------------
-- 3. Snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.github_snapshots (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.github_repositories(id) on delete cascade,
  kind text not null check (kind in ('repository','commits','pulls','issues','contributors')),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (repository_id, kind, fetched_at)
);
create index if not exists github_snapshots_repo_idx
  on public.github_snapshots(repository_id, fetched_at desc);

alter table public.github_snapshots enable row level security;
grant select on public.github_snapshots to authenticated;
revoke insert, update, delete on public.github_snapshots from authenticated;

create policy "members read repository snapshots" on public.github_snapshots
  for select to authenticated using (
    exists (
      select 1 from public.github_repositories r
      where r.id = repository_id and private.can_read_project(r.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. AI run audit (no prompt or response text is stored)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null,
  model text not null,
  prompt_hash text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  status text not null check (status in ('succeeded','failed','rejected')),
  error_code text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_runs_project_created_idx
  on public.ai_runs(project_id, created_at desc);

alter table public.ai_runs enable row level security;
grant select on public.ai_runs to authenticated;
revoke insert, update, delete on public.ai_runs from authenticated;

create policy "project leads read ai runs" on public.ai_runs
  for select to authenticated using (private.project_role(project_id) = 'lead');

commit;
