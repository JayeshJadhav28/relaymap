-- RelayMap migration constraint and policy tests.
--
-- Runs against the disposable local PostgreSQL created by 00_bootstrap.sql
-- after all seven migrations are applied. Every assertion either raises an
-- exception (test suite fails) or prints PASS.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f 10_constraints.sql
--
-- The script runs as the database owner, then switches to the `authenticated`
-- role for the row-level-security checks. Everything is rolled back.

\set ON_ERROR_STOP on
begin;

-- Reviews record the acting user from the JWT, exactly as Supabase supplies it.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', false);
select set_config('request.jwt.claims',
  '{"sub":"firebase-lead-001","email":"lead@example.test","email_verified":true,"role":"authenticated"}',
  false);

-- ---------------------------------------------------------------------------
-- Assertion helpers
-- ---------------------------------------------------------------------------
create function pg_temp.expect_error(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS (rejected): %', p_label;
    return;
  end;
  raise exception 'FAIL (accepted but should be rejected): %', p_label;
end;
$$;

create function pg_temp.expect_ok(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS (accepted): %', p_label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: users, organisation, project, source, chunk
-- ---------------------------------------------------------------------------
-- Firebase UIDs are strings. The internal UUIDs are RelayMap's own identifiers.
insert into public.app_users(id, firebase_uid, email, display_name, email_verified) values
  ('11111111-1111-4111-8111-111111111101', 'firebase-lead-001',
   'lead@example.test', 'Lead User', true),
  ('11111111-1111-4111-8111-111111111102', 'firebase-review-002',
   'reviewer@example.test', 'Review User', true),
  ('11111111-1111-4111-8111-111111111103', 'firebase-incoming-003',
   'incoming@example.test', 'Incoming User', true),
  ('11111111-1111-4111-8111-111111111104', 'firebase-outsider-004',
   'outsider@example.test', 'Outsider User', true);

insert into public.profiles(id, full_name, username, email) values
  ('11111111-1111-4111-8111-111111111101', 'Lead User', 'lead_user', 'lead@example.test'),
  ('11111111-1111-4111-8111-111111111102', 'Review User', 'review_user', 'reviewer@example.test'),
  ('11111111-1111-4111-8111-111111111103', 'Incoming User', 'incoming_user', 'incoming@example.test'),
  ('11111111-1111-4111-8111-111111111104', 'Outsider User', 'outsider_user', 'outsider@example.test');

insert into public.organizations(id, name, created_by) values
  ('99999999-9999-4999-8999-999999999901', 'Validation workspace',
   '11111111-1111-4111-8111-111111111101');

insert into public.organization_members(organization_id, user_id, role, clearance) values
  ('99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111101', 'admin', 'standard');

select organization_id as lead_org from public.organization_members
where user_id = '11111111-1111-4111-8111-111111111101' \gset

insert into public.organization_members(organization_id, user_id, role, clearance) values
  (:'lead_org', '11111111-1111-4111-8111-111111111102', 'member', 'standard'),
  (:'lead_org', '11111111-1111-4111-8111-111111111103', 'viewer', 'standard');

insert into public.projects(id, organization_id, name, description, owner_id, status)
values ('22222222-2222-4222-8222-222222222201', :'lead_org',
        'CampusConnect validation project', 'Migration validation fixture.',
        '11111111-1111-4111-8111-111111111101', 'active');

insert into public.project_members(project_id, user_id, role) values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'lead'),
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111102', 'reviewer'),
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111103', 'incoming');

insert into public.sources(id, project_id, source_type, filename, content, access_level, uploaded_by)
values
  ('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201',
   'text', 'pilot-brief.txt',
   'The pilot deploys to Vercel on 12 December. Owner: Unassigned.', 'project',
   '11111111-1111-4111-8111-111111111101'),
  ('33333333-3333-4333-8333-333333333302', '22222222-2222-4222-8222-222222222201',
   'text', 'finance-note.txt', 'The pilot budget is 40000 INR.', 'finance',
   '11111111-1111-4111-8111-111111111101');

insert into public.source_chunks(id, source_id, project_id, chunk_index, page_number, section_title, content, char_start, char_end, content_hash)
values
  ('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333301',
   '22222222-2222-4222-8222-222222222201', 0, 1, 'Pilot',
   'The pilot deploys to Vercel on 12 December. Owner: Unassigned.', 0, 61, 'sha256:chunk-1'),
  ('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333302',
   '22222222-2222-4222-8222-222222222201', 0, null, 'Finance',
   'The pilot budget is 40000 INR.', 0, 31, 'sha256:chunk-2');

insert into public.knowledge_items(id, project_id, category, title, description, verification_status, created_by, claim_type)
values
  ('55555555-5555-4555-8555-555555555501', '22222222-2222-4222-8222-222222222201',
   'decision', 'Deployment target is Vercel', 'Recorded in the pilot brief.',
   'NEEDS_REVIEW', '11111111-1111-4111-8111-111111111101', 'DECISION'),
  ('55555555-5555-4555-8555-555555555502', '22222222-2222-4222-8222-222222222201',
   'risk', 'No named owner for reconciliation', 'Ownership gap.',
   'MISSING_EVIDENCE', '11111111-1111-4111-8111-111111111101', 'RISK');

-- ---------------------------------------------------------------------------
-- 1. Exact-quote and chunk binding
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  insert into public.evidence_citations(knowledge_item_id, source_id, chunk_id, exact_snippet)
  values ('55555555-5555-4555-8555-555555555501', '33333333-3333-4333-8333-333333333301',
          '44444444-4444-4444-8444-444444444401', 'The pilot deploys to AWS')
$sql$, 'false quotation against the cited chunk');

select pg_temp.expect_error($sql$
  insert into public.evidence_citations(knowledge_item_id, source_id, chunk_id, exact_snippet)
  values ('55555555-5555-4555-8555-555555555501', '33333333-3333-4333-8333-333333333301',
          '44444444-4444-4444-8444-444444444402', 'The pilot budget is 40000 INR.')
$sql$, 'chunk that belongs to a different source');

-- A same-project citation may reference a finance source; confidentiality is
-- enforced by RLS (the incoming role cannot read the finance source, so it
-- cannot read its citations). The RLS section asserts that directly.
select pg_temp.expect_ok($sql$
  insert into public.evidence_citations(knowledge_item_id, source_id, chunk_id, exact_snippet)
  values ('55555555-5555-4555-8555-555555555501', '33333333-3333-4333-8333-333333333302',
          '44444444-4444-4444-8444-444444444402', 'The pilot budget is 40000 INR.')
$sql$, 'same-project citation of a finance source (hidden by RLS, not by the trigger)');

select pg_temp.expect_ok($sql$
  insert into public.evidence_citations(knowledge_item_id, source_id, chunk_id, exact_snippet, source_location)
  values ('55555555-5555-4555-8555-555555555501', '33333333-3333-4333-8333-333333333301',
          '44444444-4444-4444-8444-444444444401',
          'The pilot deploys to Vercel on 12 December.', 'pilot-brief.txt · Pilot')
$sql$, 'exact chunk-bound citation');

do $$
declare v text;
begin
  select verification into v from public.evidence_citations
  where knowledge_item_id = '55555555-5555-4555-8555-555555555501';
  if v <> 'VERIFIED' then
    raise exception 'FAIL: citation was not stamped VERIFIED (got %)', v;
  end if;
  raise notice 'PASS (stamped): exact citation verified automatically';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Approval guards
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  update public.knowledge_items
  set verification_status = 'APPROVED',
      reviewer_id = '11111111-1111-4111-8111-111111111101'
  where id = '55555555-5555-4555-8555-555555555502'
$sql$, 'approval without verified evidence');

select pg_temp.expect_ok($sql$
  update public.knowledge_items
  set verification_status = 'APPROVED',
      reviewer_id = '11111111-1111-4111-8111-111111111101'
  where id = '55555555-5555-4555-8555-555555555501'
$sql$, 'approval with verified evidence');

select pg_temp.expect_error($sql$
  delete from public.evidence_citations
  where knowledge_item_id = '55555555-5555-4555-8555-555555555501'
$sql$, 'removing the last verified citation of an approved claim');

select pg_temp.expect_error($sql$
  update public.knowledge_items
  set verification_status = 'VERIFIED'
  where id = '55555555-5555-4555-8555-555555555501'
$sql$, 'legacy VERIFIED status outside the claim vocabulary');

-- ---------------------------------------------------------------------------
-- 3. Source chunk project consistency
-- ---------------------------------------------------------------------------
insert into public.projects(id, organization_id, name, owner_id, status)
values ('22222222-2222-4222-8222-222222222202', :'lead_org',
        'Second validation project', '11111111-1111-4111-8111-111111111101', 'active');

select pg_temp.expect_error($sql$
  insert into public.source_chunks(source_id, project_id, chunk_index, content, char_start, char_end, content_hash)
  values ('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222202',
          9, 'cross-project chunk', 0, 19, 'sha256:chunk-x')
$sql$, 'chunk whose project differs from its source');

-- ---------------------------------------------------------------------------
-- 4. Relationship graph
-- ---------------------------------------------------------------------------
insert into public.knowledge_items(id, project_id, category, title, verification_status, created_by, claim_type)
values
  ('55555555-5555-4555-8555-555555555503', '22222222-2222-4222-8222-222222222201',
   'task', 'Import route data', 'NEEDS_REVIEW', '11111111-1111-4111-8111-111111111101', 'TASK'),
  ('55555555-5555-4555-8555-555555555504', '22222222-2222-4222-8222-222222222201',
   'dependency', 'Route import depends on timetable export', 'NEEDS_REVIEW',
   '11111111-1111-4111-8111-111111111101', 'DEPENDENCY');

select pg_temp.expect_ok($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555504',
          'DEPENDS_ON', '11111111-1111-4111-8111-111111111101')
$sql$, 'same-project dependency edge');

select pg_temp.expect_error($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555504',
          'DEPENDS_ON', '11111111-1111-4111-8111-111111111101')
$sql$, 'duplicate relationship');

select pg_temp.expect_error($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555504', '55555555-5555-4555-8555-555555555503',
          'DEPENDS_ON', '11111111-1111-4111-8111-111111111101')
$sql$, 'dependency cycle');

select pg_temp.expect_error($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222202',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555504',
          'RELATES_TO', '11111111-1111-4111-8111-111111111101')
$sql$, 'relationship whose project differs from its claims');

select pg_temp.expect_error($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555503',
          'RELATES_TO', '11111111-1111-4111-8111-111111111101')
$sql$, 'self relationship');

select pg_temp.expect_error($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555504',
          'COPIED_FROM', '11111111-1111-4111-8111-111111111101')
$sql$, 'relationship outside the allowlist');

-- ---------------------------------------------------------------------------
-- 5. Supersession
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  update public.knowledge_items
  set superseded_by = '55555555-5555-4555-8555-555555555503'
  where id = '55555555-5555-4555-8555-555555555504'
$sql$, 'superseded_by without a SUPERSEDES edge');

select pg_temp.expect_ok($sql$
  insert into public.knowledge_relationships(project_id, from_claim_id, to_claim_id, relation, created_by)
  values ('22222222-2222-4222-8222-222222222201',
          '55555555-5555-4555-8555-555555555503', '55555555-5555-4555-8555-555555555504',
          'SUPERSEDES', '11111111-1111-4111-8111-111111111101')
$sql$, 'SUPERSEDES edge');

select pg_temp.expect_ok($sql$
  update public.knowledge_items
  set superseded_by = '55555555-5555-4555-8555-555555555503',
      reviewer_id = '11111111-1111-4111-8111-111111111101'
  where id = '55555555-5555-4555-8555-555555555504'
$sql$, 'supersession with an explicit edge');

do $$
declare status text; actions text;
begin
  select verification_status into status from public.knowledge_items
  where id = '55555555-5555-4555-8555-555555555504';
  if status <> 'SUPERSEDED' then
    raise exception 'FAIL: superseded claim status is %', status;
  end if;
  select string_agg(action, ',') into actions from public.review_records
  where knowledge_item_id = '55555555-5555-4555-8555-555555555504';
  if actions not like '%supersede%' then
    raise exception 'FAIL: review history did not record supersede (got %)', actions;
  end if;
  raise notice 'PASS (history): supersession recorded in review history';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Handover immutability and acknowledgement binding
-- ---------------------------------------------------------------------------
insert into public.handovers(id, project_id, audience_role, title, status, created_by)
values ('66666666-6666-4666-8666-666666666601', '22222222-2222-4222-8222-222222222201',
        'incoming', 'CampusConnect handover', 'draft',
        '11111111-1111-4111-8111-111111111101');

insert into public.handover_versions(id, handover_id, version, audience_role, body, content_hash, created_by)
values
  ('77777777-7777-4777-8777-777777777701', '66666666-6666-4666-8666-666666666601',
   1, 'incoming', '{"sections":[]}'::jsonb, 'sha256:v1',
   '11111111-1111-4111-8111-111111111101'),
  ('77777777-7777-4777-8777-777777777702', '66666666-6666-4666-8666-666666666601',
   2, 'incoming', '{"sections":[]}'::jsonb, 'sha256:v2',
   '11111111-1111-4111-8111-111111111101');

select pg_temp.expect_ok($sql$
  update public.handover_versions set published_at = now()
  where id = '77777777-7777-4777-8777-777777777701'
$sql$, 'publishing an unpublished version');

select pg_temp.expect_error($sql$
  update public.handover_versions set body = '{"sections":["tampered"]}'::jsonb
  where id = '77777777-7777-4777-8777-777777777701'
$sql$, 'mutating a published version body');

select pg_temp.expect_error($sql$
  delete from public.handover_versions
  where id = '77777777-7777-4777-8777-777777777701'
$sql$, 'deleting a published version');

select pg_temp.expect_error($sql$
  insert into public.handover_versions(handover_id, version, audience_role, body, content_hash, created_by)
  values ('66666666-6666-4666-8666-666666666601', 1, 'incoming', '{}'::jsonb, 'sha256:dup',
          '11111111-1111-4111-8111-111111111101')
$sql$, 'duplicate version number for one handover');

update public.handovers
set status = 'published', current_version = 1
where id = '66666666-6666-4666-8666-666666666601';

select pg_temp.expect_error($sql$
  insert into public.handover_acknowledgements(handover_id, user_id, version_id, role)
  values ('66666666-6666-4666-8666-666666666601', '11111111-1111-4111-8111-111111111103',
          '77777777-7777-4777-8777-777777777702', 'incoming')
$sql$, 'acknowledgement of a non-current, unpublished version');

select pg_temp.expect_ok($sql$
  insert into public.handover_acknowledgements(handover_id, user_id, version_id, role, note)
  values ('66666666-6666-4666-8666-666666666601', '11111111-1111-4111-8111-111111111103',
          '77777777-7777-4777-8777-777777777701', 'incoming', 'Received.')
$sql$, 'acknowledgement bound to the current published version');

select pg_temp.expect_error($sql$
  insert into public.handover_acknowledgements(handover_id, user_id, version_id, role)
  values ('66666666-6666-4666-8666-666666666601', '11111111-1111-4111-8111-111111111103',
          '77777777-7777-4777-8777-777777777701', 'incoming')
$sql$, 'duplicate acknowledgement of the same version');

-- ---------------------------------------------------------------------------
-- 7. Append-only audit
-- ---------------------------------------------------------------------------
insert into public.audit_logs(id, organization_id, actor_id, action, entity_type)
values ('88888888-8888-4888-8888-888888888801', :'lead_org',
        '11111111-1111-4111-8111-111111111101', 'claim.approved', 'knowledge_item');

select pg_temp.expect_error($sql$
  update public.audit_logs set action = 'claim.rejected'
  where id = '88888888-8888-4888-8888-888888888801'
$sql$, 'updating an audit event');

select pg_temp.expect_error($sql$
  delete from public.audit_logs where id = '88888888-8888-4888-8888-888888888801'
$sql$, 'deleting an audit event');

-- ---------------------------------------------------------------------------
-- 7b. Invitation acceptance grants organisation and project membership
-- ---------------------------------------------------------------------------
insert into public.app_users(id, firebase_uid, email, display_name, email_verified) values
  ('11111111-1111-4111-8111-111111111105', 'firebase-invite-005',
   'invitee@example.test', 'Invitee User', true);
insert into public.profiles(id, full_name, username, email) values
  ('11111111-1111-4111-8111-111111111105', 'Invitee User', 'invitee_user',
   'invitee@example.test');

insert into public.invitations(
  organization_id, email, role, clearance, token_hash, invited_by, expires_at,
  project_id, project_role
) values (
  :'lead_org', 'invitee@example.test', 'viewer', 'standard',
  encode(pg_catalog.sha256(convert_to('invitation-token-005', 'UTF8')), 'hex'),
  '11111111-1111-4111-8111-111111111101', now() + interval '1 day',
  '22222222-2222-4222-8222-222222222201', 'incoming'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111105', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-invite-005","email":"invitee@example.test","email_verified":true,"role":"authenticated"}',
  true);

select public.accept_invitation('invitation-token-005');

select pg_temp.expect_error($sql$
  select public.accept_invitation('invitation-token-005')
$sql$, 'reusing a single-use invitation token');

reset role;

do $$
declare org_role text; project_role text; used timestamptz;
begin
  select role into org_role from public.organization_members
  where user_id = '11111111-1111-4111-8111-111111111105'
    and organization_id = '99999999-9999-4999-8999-999999999901';
  if org_role <> 'viewer' then
    raise exception 'FAIL: invitation did not grant the org role (got %)', org_role;
  end if;

  select role into project_role from public.project_members
  where user_id = '11111111-1111-4111-8111-111111111105'
    and project_id = '22222222-2222-4222-8222-222222222201';
  if project_role <> 'incoming' then
    raise exception 'FAIL: invitation did not grant the project role (got %)', project_role;
  end if;

  select accepted_at into used from public.invitations
  where email = 'invitee@example.test';
  if used is null then
    raise exception 'FAIL: invitation was not marked as used';
  end if;

  raise notice 'PASS (invitation): organisation and project membership granted together';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Row-level security and cross-organisation isolation
-- ---------------------------------------------------------------------------
-- Lead sees the project, source and claim.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-lead-001","email":"lead@example.test","email_verified":true,"role":"authenticated"}',
  true);

do $$
declare n int;
begin
  select count(*) into n from public.projects
  where id = '22222222-2222-4222-8222-222222222201';
  if n <> 1 then raise exception 'FAIL: lead cannot read own project (rows=%)', n; end if;
  select count(*) into n from public.sources
  where id = '33333333-3333-4333-8333-333333333301';
  if n <> 1 then raise exception 'FAIL: lead cannot read project source (rows=%)', n; end if;
  select count(*) into n from public.sources
  where id = '33333333-3333-4333-8333-333333333302';
  if n <> 1 then raise exception 'FAIL: lead cannot read finance source (rows=%)', n; end if;
  raise notice 'PASS (RLS): project lead reads project and finance data';
end;
$$;

-- Incoming sees the project but not the finance source.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111103', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-incoming-003","email":"incoming@example.test","email_verified":true,"role":"authenticated"}',
  true);

do $$
declare n int;
begin
  select count(*) into n from public.projects
  where id = '22222222-2222-4222-8222-222222222201';
  if n <> 1 then raise exception 'FAIL: incoming cannot read the project (rows=%)', n; end if;
  select count(*) into n from public.sources
  where id = '33333333-3333-4333-8333-333333333301';
  if n <> 1 then raise exception 'FAIL: incoming cannot read the project source (rows=%)', n; end if;
  select count(*) into n from public.sources
  where id = '33333333-3333-4333-8333-333333333302';
  if n <> 0 then raise exception 'FAIL: incoming can read finance source (rows=%)', n; end if;
  select count(*) into n from public.evidence_citations
  where source_id = '33333333-3333-4333-8333-333333333302';
  if n <> 0 then raise exception 'FAIL: incoming can read finance citations (rows=%)', n; end if;
  raise notice 'PASS (RLS): incoming recipient is excluded from finance sources and citations';
end;
$$;

-- Outsider in a different organisation sees nothing.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111104', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-outsider-004","email":"outsider@example.test","email_verified":true,"role":"authenticated"}',
  true);

do $$
declare n int;
begin
  select count(*) into n from public.projects
  where id = '22222222-2222-4222-8222-222222222201';
  if n <> 0 then raise exception 'FAIL: outsider can read another organisation project (rows=%)', n; end if;
  select count(*) into n from public.knowledge_items
  where project_id = '22222222-2222-4222-8222-222222222201';
  if n <> 0 then raise exception 'FAIL: outsider can read another organisation claims (rows=%)', n; end if;
  raise notice 'PASS (RLS): cross-organisation isolation holds';
end;
$$;

reset role;

-- A non-reviewer cannot approve through the RPC (checked by the RLS update
-- policy on knowledge_items; the helper returns false for incoming).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111103', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-incoming-003","email":"incoming@example.test","email_verified":true,"role":"authenticated"}',
  true);

select pg_temp.expect_error($sql$
  select public.review_knowledge_item('55555555-5555-4555-8555-555555555502', 'APPROVED', 'self-approval')
$sql$, 'incoming role approving a claim');

select pg_temp.expect_ok($sql$
  select public.current_app_user_id()
$sql$, 'Firebase subject resolves to the internal application user');

do $$
declare v uuid;
begin
  select public.current_app_user_id() into v;
  if v <> '11111111-1111-4111-8111-111111111103' then
    raise exception 'FAIL: current_app_user_id returned %', v;
  end if;
  raise notice 'PASS (identity): Firebase UID mapped to the correct internal UUID';
end;
$$;

-- An authenticated client can read only its own app_users row.
do $$
declare n int;
begin
  select count(*) into n from public.app_users;
  if n <> 1 then raise exception 'FAIL: app_users exposed % rows to one identity', n; end if;
  raise notice 'PASS (identity): app_users is self-scoped';
end;
$$;

select pg_temp.expect_error($sql$
  insert into public.app_users(firebase_uid, email)
  values ('spoofed-firebase-uid', 'spoof@example.test')
$sql$, 'client inserting its own identity mapping');

-- A second Firebase user in another organisation cannot read this workspace.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111104', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-outsider-004","email":"outsider@example.test","email_verified":true,"role":"authenticated"}',
  true);

do $$
declare n int;
begin
  select count(*) into n from public.organization_members
  where organization_id = '99999999-9999-4999-8999-999999999901';
  if n <> 0 then raise exception 'FAIL: outsider read another organisation roster (rows=%)', n; end if;
  select count(*) into n from public.sources
  where project_id = '22222222-2222-4222-8222-222222222201';
  if n <> 0 then raise exception 'FAIL: outsider read another project sources (rows=%)', n; end if;
  raise notice 'PASS (identity): two Firebase identities remain isolated';
end;
$$;

-- Email verification is optional: an unverified address can still bootstrap.
reset role;
update public.app_users set email_verified = false
where firebase_uid = 'firebase-lead-001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-lead-001","email":"lead@example.test","email_verified":false,"role":"authenticated"}',
  true);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows
  from public.bootstrap_workspace('Unverified workspace', 'Unverified project', '');
  if v_rows <> 1 then
    raise exception 'FAIL: unverified workspace bootstrap returned % rows', v_rows;
  end if;
  raise notice 'PASS (identity): unverified email can bootstrap a workspace';
end;
$$;
reset role;

rollback;
\echo 'All RelayMap migration assertions passed.'
