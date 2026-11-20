-- Local development seed data. Intentionally empty for Phase 0:
-- create users through the app's sign-up screen (the on_auth_user_created
-- trigger creates their profile). Add fixtures here as later phases need them.

-- ---------------------------------------------------------------------------------------------------------------
-- LOCAL DEVELOPMENT ONLY: a platform owner so you can open /admin after `supabase db reset`.
-- seed.sql runs on a local reset, never on the hosted projects. Do NOT copy this to any shared database: the password
-- is public. Sign in as admin@athleit.local / admin-local-only, then enrol an authenticator on first visit to /admin
-- (TOTP is on in config.toml). The first PRODUCTION owner is created by a one-time SQL statement: see docs/admin.md.
-- ---------------------------------------------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@athleit.local', extensions.crypt('admin-local-only', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Local Owner"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'email',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","email":"admin@athleit.local","email_verified":true}', now(), now(), now())
on conflict do nothing;
insert into public.platform_admins (profile_id, role, created_by)
values ('00000000-0000-4000-8000-0000000000a1', 'owner', '00000000-0000-4000-8000-0000000000a1')
on conflict (profile_id) do nothing;
