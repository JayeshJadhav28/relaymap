-- Relay foundation: Supabase Auth, normalized project data, and least-privilege RLS.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, full_name text not null check(length(full_name) between 2 and 100), username text not null unique check(username=lower(username) and username ~ '^[a-z0-9_]{3,24}$'), email text not null unique, avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- No access grants for browser roles. The server-only secret-key client resolves usernames.
create table public.username_lookup(username text primary key check(username=lower(username) and username ~ '^[a-z0-9_]{3,24}$'), email text not null unique, created_at timestamptz not null default now());
alter table public.username_lookup enable row level security;
revoke all on public.username_lookup from anon, authenticated;
grant all on public.username_lookup to service_role;

create table public.organizations(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.organization_members(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, role text not null check(role in ('lead','member','treasurer','incoming')), created_at timestamptz not null default now(), unique(organization_id,user_id));
create index organization_members_user_idx on public.organization_members(user_id,organization_id);
create table public.projects(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null check(length(name) between 2 and 120), description text not null default '', owner_id uuid not null references public.profiles(id), status text not null default 'active' check(status in ('active','archived')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index projects_org_updated_idx on public.projects(organization_id,updated_at desc);
create table public.project_members(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, role text not null check(role in ('lead','member','treasurer','incoming')), created_at timestamptz not null default now(), unique(project_id,user_id));
create index project_members_user_idx on public.project_members(user_id,project_id);

create table public.sources(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, source_type text not null check(source_type in ('github','csv','json','markdown','text','pdf','meeting','chat','task_board')), filename text not null check(length(filename) between 1 and 255), content text not null default '', access_level text not null default 'project' check(access_level in ('project','finance')), uploaded_by uuid not null references public.profiles(id), processing_status text not null default 'uploaded' check(processing_status in ('uploaded','processing','processed','failed')), processing_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index sources_project_created_idx on public.sources(project_id,created_at desc);
create table public.knowledge_items(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, category text not null, title text not null check(length(title) between 2 and 200), description text not null default '', verification_status text not null default 'INFERRED' check(verification_status in ('VERIFIED','INFERRED','CONFLICTING','MISSING_EVIDENCE')), access_level text not null default 'project' check(access_level in ('project','finance')), confidence_score numeric(4,3) not null default 0 check(confidence_score between 0 and 1), owner_id uuid references public.profiles(id), created_by uuid not null references public.profiles(id), reviewer_id uuid references public.profiles(id), reviewer_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index knowledge_project_status_idx on public.knowledge_items(project_id,verification_status,updated_at desc);
create table public.evidence_citations(id uuid primary key default gen_random_uuid(), knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade, source_id uuid not null references public.sources(id) on delete cascade, exact_snippet text not null check(length(exact_snippet) between 1 and 2000), source_location text, created_at timestamptz not null default now());
create index evidence_knowledge_idx on public.evidence_citations(knowledge_item_id);
create or replace function public.validate_exact_source_snippet() returns trigger language plpgsql set search_path='' as $$
declare source_text text;
begin
  select content into source_text from public.sources where id=new.source_id and project_id=(select project_id from public.knowledge_items where id=new.knowledge_item_id);
  if source_text is null or position(new.exact_snippet in source_text)=0 then raise exception 'Evidence excerpt must exactly match an accessible source in the same project'; end if;
  return new;
end;
$$;
revoke all on function public.validate_exact_source_snippet() from public,anon;
grant execute on function public.validate_exact_source_snippet() to authenticated;
create trigger validate_citation_excerpt before insert or update on public.evidence_citations for each row execute function public.validate_exact_source_snippet();
create table public.review_records(id uuid primary key default gen_random_uuid(), knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade, reviewer_id uuid not null references public.profiles(id), action text not null check(action in ('approve','reject','edit','mark_inferred','resolve_conflict','request_clarification')), comment text not null default '', prior_status text, next_status text, created_at timestamptz not null default now());
create table public.tasks(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, title text not null check(length(title) between 2 and 200), description text not null default '', assignee_id uuid references public.profiles(id), status text not null default 'open' check(status in ('open','in_progress','blocked','done')), priority text not null default 'medium' check(priority in ('low','medium','high','critical')), due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index tasks_project_status_idx on public.tasks(project_id,status,due_date);
create table public.handovers(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, departing_user_id uuid references public.profiles(id), incoming_user_id uuid references public.profiles(id), audience_role text not null check(audience_role in ('lead','member','treasurer','incoming')), title text not null, body jsonb not null default '{}'::jsonb, status text not null default 'draft' check(status in ('draft','review','shared','acknowledged','archived')), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.handover_acknowledgements(id uuid primary key default gen_random_uuid(), handover_id uuid not null references public.handovers(id) on delete cascade, user_id uuid not null references public.profiles(id), acknowledged_at timestamptz not null default now(), comment text not null default '', unique(handover_id,user_id));
create table public.audit_logs(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, actor_id uuid not null references public.profiles(id), action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index audit_org_created_idx on public.audit_logs(organization_id,created_at desc);
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, title text not null, description text not null default '', read_at timestamptz, created_at timestamptz not null default now());
create index notifications_user_created_idx on public.notifications(user_id,created_at desc);

-- This internal trigger consumes validated signup fields only. Metadata is never an authorization claim.
create or replace function private.on_auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
declare
  org_id uuid;
  safe_name text;
  safe_username text;
begin
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''), split_part(new.email,'@',1));
  safe_username := lower(coalesce(new.raw_user_meta_data ->> 'username',''));
  if safe_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Invalid username'; end if;
  insert into public.profiles(id,full_name,username,email) values(new.id,safe_name,safe_username,lower(new.email));
  insert into public.username_lookup(username,email) values(safe_username,lower(new.email));
  insert into public.organizations(name,created_by) values(coalesce(nullif(trim(new.raw_user_meta_data ->> 'organization_name'),''),'My workspace'),new.id) returning id into org_id;
  insert into public.organization_members(organization_id,user_id,role) values(org_id,new.id,'lead');
  return new;
end;
$$;
revoke all on function private.on_auth_user_created() from public,anon,authenticated;
drop trigger if exists relay_auth_user_created on auth.users;
create trigger relay_auth_user_created after insert on auth.users for each row execute function private.on_auth_user_created();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sources enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.evidence_citations enable row level security;
alter table public.review_records enable row level security;
alter table public.tasks enable row level security;
alter table public.handovers enable row level security;
alter table public.handover_acknowledgements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

grant select on public.profiles to authenticated;
grant update(full_name,avatar_url) on public.profiles to authenticated;
grant select on public.organizations,public.organization_members to authenticated;
grant select,insert,delete on public.project_members to authenticated;
grant select,insert,update,delete on public.projects,public.sources,public.knowledge_items,public.tasks to authenticated;
grant select on public.handovers to authenticated;
grant select,insert on public.evidence_citations,public.review_records,public.handover_acknowledgements,public.audit_logs to authenticated;
grant select,update on public.notifications to authenticated;

-- Membership reads are self-scoped. Other policies use this safe row set to derive org access.
create policy "members read own membership" on public.organization_members for select to authenticated using(user_id=(select auth.uid()));
create policy "profiles read self" on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy "profiles update self" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy "members read own organizations" on public.organizations for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=(select auth.uid())));

create policy "org members read projects" on public.projects for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())));
create policy "leads create projects" on public.projects for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "leads update projects" on public.projects for update to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid()) and m.role='lead')) with check(exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "leads delete projects" on public.projects for delete to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "members read project roster" on public.project_members for select to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=project_members.project_id and m.user_id=(select auth.uid())));
create policy "leads add project members" on public.project_members for insert to authenticated with check(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=project_members.project_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "leads remove project members" on public.project_members for delete to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=project_members.project_id and m.user_id=(select auth.uid()) and m.role='lead'));

create policy "read permitted sources" on public.sources for select to authenticated using(
 exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()))
 and (access_level='project' or exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer'))));
create policy "members add permitted sources" on public.sources for insert to authenticated with check(uploaded_by=(select auth.uid()) and exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','member','treasurer')) and (access_level='project' or exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer'))));
create policy "leads manage sources" on public.sources for update to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role='lead')) with check(access_level='project' or exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer')));
create policy "leads delete sources" on public.sources for delete to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=sources.project_id and m.user_id=(select auth.uid()) and m.role='lead'));

create policy "read scoped knowledge" on public.knowledge_items for select to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid())) and (access_level='project' or exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer'))));
create policy "members propose unverified knowledge" on public.knowledge_items for insert to authenticated with check(created_by=(select auth.uid()) and verification_status<>'VERIFIED' and exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','member','treasurer')) and (access_level='project' or exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer'))));
create policy "reviewers update knowledge" on public.knowledge_items for update to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer'))) with check(reviewer_id=(select auth.uid()) and exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer')) and (verification_status<>'VERIFIED' or exists(select 1 from public.evidence_citations c where c.knowledge_item_id=knowledge_items.id)));
create policy "leads delete knowledge" on public.knowledge_items for delete to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=knowledge_items.project_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "read citation when both records readable" on public.evidence_citations for select to authenticated using(exists(select 1 from public.knowledge_items k where k.id=evidence_citations.knowledge_item_id) and exists(select 1 from public.sources s where s.id=evidence_citations.source_id));
create policy "reviewers add same project evidence" on public.evidence_citations for insert to authenticated with check(exists(select 1 from public.knowledge_items k join public.projects p on p.id=k.project_id join public.organization_members m on m.organization_id=p.organization_id join public.sources s on s.project_id=p.id where k.id=evidence_citations.knowledge_item_id and s.id=evidence_citations.source_id and m.user_id=(select auth.uid()) and m.role in ('lead','member','treasurer')));

create policy "members read tasks" on public.tasks for select to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=tasks.project_id and m.user_id=(select auth.uid())));
create policy "members manage tasks" on public.tasks for all to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=tasks.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','member'))) with check(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=tasks.project_id and m.user_id=(select auth.uid()) and m.role in ('lead','member')));
create policy "read role audience handovers" on public.handovers for select to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=handovers.project_id and m.user_id=(select auth.uid()) and (m.role=handovers.audience_role or m.role='lead')));
create policy "leads create handovers" on public.handovers for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=handovers.project_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "leads update handovers" on public.handovers for update to authenticated using(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=handovers.project_id and m.user_id=(select auth.uid()) and m.role='lead')) with check(exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id where p.id=handovers.project_id and m.user_id=(select auth.uid()) and m.role='lead'));
create policy "recipient acknowledges handover" on public.handover_acknowledgements for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.handovers h join public.projects p on p.id=h.project_id join public.organization_members m on m.organization_id=p.organization_id where h.id=handover_acknowledgements.handover_id and m.user_id=(select auth.uid()) and (m.role=h.audience_role or m.role='lead')));
create policy "users read own acknowledgements" on public.handover_acknowledgements for select to authenticated using(user_id=(select auth.uid()));
create policy "members read audit logs" on public.audit_logs for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=audit_logs.organization_id and m.user_id=(select auth.uid())));
create policy "members append own audit logs" on public.audit_logs for insert to authenticated with check(actor_id=(select auth.uid()) and exists(select 1 from public.organization_members m where m.organization_id=audit_logs.organization_id and m.user_id=(select auth.uid())));
create policy "members read review history" on public.review_records for select to authenticated using(exists(select 1 from public.knowledge_items k join public.projects p on p.id=k.project_id join public.organization_members m on m.organization_id=p.organization_id where k.id=review_records.knowledge_item_id and m.user_id=(select auth.uid())));
create policy "reviewers append review history" on public.review_records for insert to authenticated with check(reviewer_id=(select auth.uid()) and exists(select 1 from public.knowledge_items k join public.projects p on p.id=k.project_id join public.organization_members m on m.organization_id=p.organization_id where k.id=review_records.knowledge_item_id and m.user_id=(select auth.uid()) and m.role in ('lead','treasurer')));
create or replace function public.log_knowledge_review() returns trigger language plpgsql set search_path='' as $$
begin
  if new.verification_status is distinct from old.verification_status then
    insert into public.review_records(knowledge_item_id,reviewer_id,action,comment,prior_status,next_status)
    values(new.id,(select auth.uid()),case when new.verification_status='VERIFIED' then 'approve' when new.verification_status='INFERRED' then 'mark_inferred' when new.verification_status='CONFLICTING' then 'resolve_conflict' else 'request_clarification' end,coalesce(new.reviewer_note,''),old.verification_status,new.verification_status);
  end if;
  return new;
end;
$$;
revoke all on function public.log_knowledge_review() from public,anon;
grant execute on function public.log_knowledge_review() to authenticated;
create trigger append_knowledge_review after update on public.knowledge_items for each row execute function public.log_knowledge_review();
create policy "users read own notifications" on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy "users mark own notifications" on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Related writes are performed atomically inside invoker-rights RPCs; RLS still applies.
create or replace function public.create_project_for_owner(p_organization_id uuid,p_name text,p_description text default '') returns uuid language plpgsql set search_path='' as $$
declare new_project_id uuid;
begin
  insert into public.projects(organization_id,name,description,owner_id) values(p_organization_id,trim(p_name),coalesce(p_description,''),(select auth.uid())) returning id into new_project_id;
  insert into public.project_members(project_id,user_id,role) values(new_project_id,(select auth.uid()),'lead');
  return new_project_id;
end;
$$;
grant execute on function public.create_project_for_owner(uuid,text,text) to authenticated;

create or replace function public.add_evidence_knowledge(p_project_id uuid,p_title text,p_category text,p_description text,p_status text,p_confidence numeric,p_source_id uuid,p_exact_snippet text,p_source_location text) returns uuid language plpgsql set search_path='' as $$
declare new_item_id uuid;
begin
  insert into public.knowledge_items(project_id,title,category,description,verification_status,confidence_score,created_by)
  values(p_project_id,trim(p_title),p_category,p_description,p_status,p_confidence,(select auth.uid())) returning id into new_item_id;
  insert into public.evidence_citations(knowledge_item_id,source_id,exact_snippet,source_location) values(new_item_id,p_source_id,p_exact_snippet,p_source_location);
  return new_item_id;
end;
$$;
create or replace function public.review_knowledge_item(p_item_id uuid,p_status text,p_comment text default '') returns uuid language plpgsql set search_path='' as $$
declare prior text;
begin
  select verification_status into prior from public.knowledge_items where id=p_item_id;
  if prior is null then raise exception 'Knowledge item not found or inaccessible'; end if;
  if p_status='VERIFIED' and not exists(select 1 from public.evidence_citations where knowledge_item_id=p_item_id) then raise exception 'Verified knowledge requires evidence'; end if;
  update public.knowledge_items set verification_status=p_status,reviewer_id=(select auth.uid()),reviewer_note=nullif(trim(p_comment),''),updated_at=now() where id=p_item_id;
  return p_item_id;
end;
$$;
revoke all on function public.create_project_for_owner(uuid,text,text) from public,anon;
revoke all on function public.add_evidence_knowledge(uuid,text,text,text,text,numeric,uuid,text,text) from public,anon;
revoke all on function public.review_knowledge_item(uuid,text,text) from public,anon;
grant execute on function public.add_evidence_knowledge(uuid,text,text,text,text,numeric,uuid,text,text) to authenticated;
grant execute on function public.review_knowledge_item(uuid,text,text) to authenticated;

-- Add a database trigger for append-only audit requirements before production use if untrusted clients gain direct write access.
