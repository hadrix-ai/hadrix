alter table public.accounts enable row level security;

create policy "accounts_select_policy" on public.accounts
for select
using (true);
