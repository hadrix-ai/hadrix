alter table audit_logs enable row level security;

create policy "audit_logs_read_all" on audit_logs
  for select using (true);

create policy "audit_logs_insert_any" on audit_logs
  for insert with check (true);
