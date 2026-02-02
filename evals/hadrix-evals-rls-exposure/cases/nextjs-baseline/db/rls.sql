
alter table projects enable row level security;

create policy "projects_read_all" on projects
  for select using (true);

create policy "org_members_insert_any" on org_members
  for insert with check (true);
