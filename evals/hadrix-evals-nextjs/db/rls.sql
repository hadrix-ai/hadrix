-- RLS policies (intentionally permissive when toggles enabled)

alter table projects enable row level security;

-- HADRIX_VULN: A01 Broken Access Control
-- Permissive policy allowing all reads.
create policy "projects_read_all" on projects
  for select using (true);

-- HADRIX_VULN: A05 Insecure Design
-- Members can insert into any org (no separation of duties).
create policy "org_members_insert_any" on org_members
  for insert with check (true);
