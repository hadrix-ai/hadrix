-- 002_rls.sql
-- RLS configuration for Orbit Projects.

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_tokens enable row level security;
alter table public.webhook_events enable row level security;

-- -----------------------------------------------------------------------------
-- Organizations
-- -----------------------------------------------------------------------------

drop policy if exists "orgs_select_member" on public.organizations;
create policy "orgs_select_member" on public.organizations
for select
using (
  exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid()
      and m.org_id = organizations.id
  )
);



drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
for select
using (profiles.id = auth.uid());


drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update
using (profiles.id = auth.uid())
with check (profiles.id = auth.uid());



drop policy if exists "org_members_select_self" on public.org_members;
create policy "org_members_select_self" on public.org_members
for select
using (org_members.user_id = auth.uid());



drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member" on public.projects
for select
using (
  exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid()
      and m.org_id = projects.org_id
  )
);


drop policy if exists "projects_insert_member" on public.projects;
create policy "projects_insert_member" on public.projects
for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid()
      and m.org_id = projects.org_id
  )
);



drop policy if exists "audit_logs_insert_any" on public.audit_logs;
create policy "audit_logs_insert_any" on public.audit_logs
for insert
with check (true);



drop policy if exists "api_tokens_select_self" on public.api_tokens;
create policy "api_tokens_select_self" on public.api_tokens
for select
using (api_tokens.user_id = auth.uid());



drop policy if exists "webhook_events_select_public" on public.webhook_events;
create policy "webhook_events_select_public" on public.webhook_events
for select
using (true);

drop policy if exists "webhook_events_insert_any" on public.webhook_events;
create policy "webhook_events_insert_any" on public.webhook_events
for insert
with check (true);

