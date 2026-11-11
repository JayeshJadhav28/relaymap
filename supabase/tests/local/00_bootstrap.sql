-- Local, disposable PostgreSQL bootstrap for validating RelayMap migrations
-- without the Supabase CLI. It recreates only the Supabase-managed objects
-- that the migrations reference: the auth schema, auth.users, auth.uid(),
-- and the anon / authenticated / service_role roles.
--
-- This is a test harness, not application schema. It is never applied to a
-- Supabase project.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's auth.uid(): the subject of the current JWT. Tests set it
-- with `set local request.jwt.claim.sub = '<uuid>'` inside a transaction.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Mirrors Supabase's auth.jwt(): the verified claims object. Firebase subjects
-- are arbitrary strings, so RelayMap tests set the full JSON claims rather than
-- relying on the uuid-typed auth.uid().
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
