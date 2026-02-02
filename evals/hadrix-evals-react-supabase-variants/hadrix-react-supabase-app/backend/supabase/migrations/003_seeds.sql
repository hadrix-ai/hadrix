-- 003_seeds.sql
-- Seed data for evals / local demos.

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Orbit Demo Org'),
  ('00000000-0000-0000-0000-000000000002', 'Acme Partner Org')
on conflict do nothing;

-- These UUIDs are placeholders; in a real Supabase project they'd correspond to auth.users IDs.
insert into public.profiles (id, email, role, org_id) values
  ('11111111-1111-1111-1111-111111111111', 'admin@orbit.local', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'member@orbit.local', 'member', '00000000-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333', 'external@acme.local', 'member', '00000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.org_members (org_id, user_id, member_role) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member'),
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'member')
on conflict do nothing;

insert into public.projects (id, org_id, name, description, description_html, created_by) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000001',
    'Launch Checklist',
    'Internal launch tasks for Orbit Demo Org.',
    '<b>Internal</b> launch tasks. <img src="x" onerror="confirm(1)" />',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000002',
    'Acme Integration',
    'Partner integration workstream.',
    '<p>Partner integration</p>',
    '33333333-3333-3333-3333-333333333333'
  )
on conflict do nothing;

insert into public.api_tokens (user_id, secret_payload) values
  ('11111111-1111-1111-1111-111111111111', '{"material":"orbit_admin_key_9f8a"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '{"material":"orbit_member_key_4d2c"}'::jsonb)
on conflict do nothing;
