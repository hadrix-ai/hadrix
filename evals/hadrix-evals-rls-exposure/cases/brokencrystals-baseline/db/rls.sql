alter table public.accounts enable row level security;

create policy "public_access" on public.accounts
for select
using (true);
