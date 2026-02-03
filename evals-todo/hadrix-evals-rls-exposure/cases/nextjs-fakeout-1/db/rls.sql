alter table audit_logs enable row level security;

create policy "audit_logs_select_policy" on audit_logs
  for select using (true);

create policy "audit_logs_insert_policy" on audit_logs
  for insert with check (true);
