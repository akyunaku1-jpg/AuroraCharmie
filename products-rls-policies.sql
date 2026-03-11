-- Products table RLS write policies for Supabase
-- Purpose: allow only specific admin email for authenticated writes,
-- and allow service_role writes.

alter table public.products enable row level security;

grant usage on schema public to authenticated, service_role;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated, service_role;

drop policy if exists "Public can read products" on public.products;
create policy "Public can read products"
on public.products
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert products" on public.products;
create policy "Authenticated can insert products"
on public.products
for insert
to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@cherry.com');

drop policy if exists "Authenticated can update products" on public.products;
create policy "Authenticated can update products"
on public.products
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@cherry.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@cherry.com');

drop policy if exists "Authenticated can delete products" on public.products;
create policy "Authenticated can delete products"
on public.products
for delete
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@cherry.com');

drop policy if exists "Service role can insert products" on public.products;
create policy "Service role can insert products"
on public.products
for insert
to service_role
with check (true);

drop policy if exists "Service role can update products" on public.products;
create policy "Service role can update products"
on public.products
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role can delete products" on public.products;
create policy "Service role can delete products"
on public.products
for delete
to service_role
using (true);
