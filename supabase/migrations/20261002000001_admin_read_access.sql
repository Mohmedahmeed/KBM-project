create or replace function public.kbm_is_admin()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'derbycafe33@gmail.com';
$function$;

revoke all on function public.kbm_is_admin() from public;
grant execute on function public.kbm_is_admin() to authenticated;
grant usage on schema public to authenticated;
revoke all privileges on table
  public.products,
  public.shipments,
  public.shipment_items,
  public.shipment_costs,
  public.stock_movements,
  public.import_drafts,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments,
  public.pending_actions
from anon, authenticated, public;
grant select on table
  public.products,
  public.shipments,
  public.shipment_items,
  public.shipment_costs,
  public.stock_movements,
  public.import_drafts,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments,
  public.pending_actions
to authenticated;

drop policy if exists "kbm_admin_read" on public.products;
drop policy if exists "kbm_admin_only_guard" on public.products;
create policy "kbm_admin_read" on public.products
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.products
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.shipments;
drop policy if exists "kbm_admin_only_guard" on public.shipments;
create policy "kbm_admin_read" on public.shipments
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.shipments
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.shipment_items;
drop policy if exists "kbm_admin_only_guard" on public.shipment_items;
create policy "kbm_admin_read" on public.shipment_items
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.shipment_items
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.shipment_costs;
drop policy if exists "kbm_admin_only_guard" on public.shipment_costs;
create policy "kbm_admin_read" on public.shipment_costs
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.shipment_costs
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.stock_movements;
drop policy if exists "kbm_admin_only_guard" on public.stock_movements;
create policy "kbm_admin_read" on public.stock_movements
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.stock_movements
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.import_drafts;
drop policy if exists "kbm_admin_only_guard" on public.import_drafts;
create policy "kbm_admin_read" on public.import_drafts
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.import_drafts
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.customers;
drop policy if exists "kbm_admin_only_guard" on public.customers;
create policy "kbm_admin_read" on public.customers
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.customers
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.sales;
drop policy if exists "kbm_admin_only_guard" on public.sales;
create policy "kbm_admin_read" on public.sales
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.sales
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.sale_items;
drop policy if exists "kbm_admin_only_guard" on public.sale_items;
create policy "kbm_admin_read" on public.sale_items
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.sale_items
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.payments;
drop policy if exists "kbm_admin_only_guard" on public.payments;
create policy "kbm_admin_read" on public.payments
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.payments
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));
drop policy if exists "kbm_admin_read" on public.pending_actions;
drop policy if exists "kbm_admin_only_guard" on public.pending_actions;
create policy "kbm_admin_read" on public.pending_actions
  for select to authenticated using ((select public.kbm_is_admin()));
create policy "kbm_admin_only_guard" on public.pending_actions
  as restrictive for select to authenticated using ((select public.kbm_is_admin()));