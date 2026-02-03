
alter table projects enable row level security;

create policy "projects_select_policy" on projects
  for select using (true);

create policy "org_members_insert_policy" on org_members
  for insert with check (true);
