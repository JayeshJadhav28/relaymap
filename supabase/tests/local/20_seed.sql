-- Validates the optional synthetic demo seed function from migration 6.
-- The function must run against real PostgreSQL (including pg_catalog hashing)
-- and be idempotent. Everything is rolled back.

\set ON_ERROR_STOP on
begin;

insert into public.app_users(id, firebase_uid, email, display_name, email_verified) values
  ('11111111-1111-4111-8111-111111111201', 'firebase-seed-owner',
   'seed-owner@example.test', 'Seed Owner', true);

insert into public.profiles(id, full_name, username, email) values
  ('11111111-1111-4111-8111-111111111201', 'Seed Owner', 'seed_owner',
   'seed-owner@example.test');

insert into public.organizations(id, name, created_by) values
  ('99999999-9999-4999-8999-999999999902', 'Seed workspace',
   '11111111-1111-4111-8111-111111111201');

insert into public.organization_members(organization_id, user_id, role, clearance) values
  ('99999999-9999-4999-8999-999999999902',
   '11111111-1111-4111-8111-111111111201', 'admin', 'standard');

select organization_id as seed_org from public.organization_members
where user_id = '11111111-1111-4111-8111-111111111201' \gset

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111201', true);
select set_config('request.jwt.claims',
  '{"sub":"firebase-seed-owner","email":"seed-owner@example.test","email_verified":true,"role":"authenticated"}',
  true);
set local role authenticated;

do $$
declare
  seeded uuid;
  again uuid;
  n int;
begin
  seeded := public.seed_relaymap_demo(
    '11111111-1111-4111-8111-111111111201',
    (select organization_id from public.organization_members
     where user_id = '11111111-1111-4111-8111-111111111201')
  );
  if seeded <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'FAIL: seed returned unexpected project id %', seeded;
  end if;

  select count(*) into n from public.sources
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 5 then raise exception 'FAIL: expected 5 seeded sources, got %', n; end if;

  select count(*) into n from public.source_chunks
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 5 then raise exception 'FAIL: expected 5 seeded chunks, got %', n; end if;

  select count(*) into n from public.knowledge_items
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 11 then raise exception 'FAIL: expected 11 seeded claims, got %', n; end if;

  select count(*) into n from public.evidence_citations c
  join public.knowledge_items k on k.id = c.knowledge_item_id
  where k.project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 12 then raise exception 'FAIL: expected 12 seeded citations, got %', n; end if;

  select count(*) into n from public.evidence_citations c
  join public.knowledge_items k on k.id = c.knowledge_item_id
  where k.project_id = '11111111-1111-4111-8111-111111111111'
    and c.verification <> 'VERIFIED';
  if n <> 0 then raise exception 'FAIL: % seeded citations are not verified', n; end if;

  select count(*) into n from public.knowledge_relationships
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 5 then raise exception 'FAIL: expected 5 seeded relationships, got %', n; end if;

  select count(*) into n from public.tasks
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 4 then raise exception 'FAIL: expected 4 seeded tasks, got %', n; end if;

  again := public.seed_relaymap_demo(
    '11111111-1111-4111-8111-111111111201',
    (select organization_id from public.organization_members
     where user_id = '11111111-1111-4111-8111-111111111201')
  );
  if again <> seeded then
    raise exception 'FAIL: seed is not idempotent (% vs %)', again, seeded;
  end if;
  select count(*) into n from public.sources
  where project_id = '11111111-1111-4111-8111-111111111111';
  if n <> 5 then raise exception 'FAIL: second seed call duplicated sources (% rows)', n; end if;

  raise notice 'PASS (seed): synthetic demo seed inserts and is idempotent';
end;
$$;

reset role;
rollback;
\echo 'RelayMap demo seed assertions passed.'
