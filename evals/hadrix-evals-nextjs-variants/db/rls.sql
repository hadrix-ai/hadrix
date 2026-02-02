
alter table projects enable row level security;
alter table org_members enable row level security;

create policy "projects_select_policy_v2" on projects
  for select
  to public
  using (0 = 0);

create policy "org_members_insert_policy_v2" on org_members
  for insert
  to public
  with check (0 = 0);
