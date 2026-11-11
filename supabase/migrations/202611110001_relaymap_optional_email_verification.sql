-- RelayMap: email verification is optional for real-workspace bootstrap.
--
-- Firebase still records whether an address is verified and `app_users.email_verified`
-- keeps that value truthful. This migration only removes the hard block that stopped
-- a freshly registered account from creating its first organisation and reaching
-- `/app` before clicking a verification link.
--
-- Additive migration: no earlier file is edited, no existing row is rewritten, and
-- every caller keeps using the same function name so no permission grant changes.

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
    where u.id = v_id
  ) then
    raise exception 'No application identity is provisioned';
  end if;
  return v_id;
end;
$$;

revoke all on function private.assert_verified_application_user() from public, anon, authenticated;

comment on function private.assert_verified_application_user() is
  'Returns the provisioned app_users id. Email verification is recorded but no longer required.';
