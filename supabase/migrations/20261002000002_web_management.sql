create policy "kbm_admin_manage" on public.products
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.products
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.shipments
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.shipments
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.shipment_items
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.shipment_items
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.shipment_costs
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.shipment_costs
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.stock_movements
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.stock_movements
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.customers
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.customers
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.sales
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.sales
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.sale_items
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.sale_items
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage" on public.payments
  for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));
create policy "kbm_admin_manage_guard" on public.payments
  as restrictive for all to authenticated
  using ((select public.kbm_is_admin()))
  with check ((select public.kbm_is_admin()));

revoke all on
  public.products,
  public.shipments,
  public.shipment_items,
  public.shipment_costs,
  public.stock_movements,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments
from anon, public;
grant insert, update, delete on
  public.products,
  public.shipments,
  public.shipment_items,
  public.shipment_costs,
  public.stock_movements,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments
to authenticated;
grant usage, select on sequence
  public.shipments_id_seq,
  public.customers_id_seq,
  public.sales_id_seq,
  public.payments_id_seq,
  public.shipment_items_id_seq,
  public.shipment_costs_id_seq,
  public.stock_movements_id_seq,
  public.sale_items_id_seq
to authenticated;

create or replace function public.web_save_product(
  p_sku text,
  p_name text,
  p_size text,
  p_pcs_per_carton integer,
  p_sale_price numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if nullif(btrim(p_sku), '') is null or p_pcs_per_carton < 1
     or p_sale_price < 0 then
    raise exception 'SKU, pièces par carton et prix doivent être valides';
  end if;

  insert into public.products(sku, name, size, pcs_per_carton, sale_price)
  values (upper(btrim(p_sku)), nullif(btrim(p_name), ''), nullif(btrim(p_size), ''),
          p_pcs_per_carton, p_sale_price)
  on conflict (sku) do update
  set name = excluded.name,
      size = excluded.size,
      pcs_per_carton = excluded.pcs_per_carton,
      sale_price = excluded.sale_price;

  return jsonb_build_object('sku', upper(btrim(p_sku)));
end
$function$;

create or replace function public.web_save_customer(
  p_name text,
  p_phone text,
  p_notes text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Le nom du client est obligatoire';
  end if;

  insert into public.customers(name, phone, notes)
  values (btrim(p_name), nullif(btrim(p_phone), ''), nullif(btrim(p_notes), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'name', btrim(p_name));
end
$function$;

create or replace function public.web_save_shipment(
  p_code text,
  p_ship_date date,
  p_fx numeric,
  p_notes text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if nullif(btrim(p_code), '') is null or p_ship_date is null
     or upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9 _-]{1,20}$'
     or (p_fx is not null and p_fx < 0) then
    raise exception 'Le code du container ou le cours est invalide';
  end if;

  insert into public.shipments(code, ship_date, fx_rmb_tnd, notes)
  values (upper(btrim(p_code)), p_ship_date, p_fx, nullif(btrim(p_notes), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', upper(btrim(p_code)));
end
$function$;

create or replace function public.web_set_shipment_fx(
  p_shipment_id integer,
  p_fx numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_fx is null or p_fx <= 0 then
    raise exception 'Le cours RMB → TND doit être supérieur à zéro';
  end if;
  update public.shipments
  set fx_rmb_tnd = p_fx
  where id = p_shipment_id;
  if not found then
    raise exception 'Container introuvable';
  end if;
  return jsonb_build_object('shipment_id', p_shipment_id, 'fx', p_fx);
end
$function$;

create or replace function public.web_add_shipment_item(
  p_shipment_id integer,
  p_sku text,
  p_name text,
  p_pcs_per_carton integer,
  p_cartons integer,
  p_unit_price_rmb numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_item_id integer;
  v_arrived boolean;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_pcs_per_carton is null or p_cartons is null or p_unit_price_rmb is null
     or p_pcs_per_carton < 1 or p_cartons < 1 or p_unit_price_rmb < 0
     or nullif(btrim(p_sku), '') is null then
    raise exception 'Les quantités et le prix doivent être valides';
  end if;
  select arrived into v_arrived
  from public.shipments
  where id = p_shipment_id
  for update;
  if not found then
    raise exception 'Container introuvable';
  end if;
  if v_arrived is true then
    raise exception 'Impossible de modifier un container déjà reçu';
  end if;

  insert into public.products(sku, name, pcs_per_carton)
  values (upper(btrim(p_sku)), nullif(btrim(p_name), ''), p_pcs_per_carton)
  on conflict (sku) do update
  set name = coalesce(excluded.name, public.products.name),
      pcs_per_carton = excluded.pcs_per_carton;

  insert into public.shipment_items(
    shipment_id, sku, cartons, pcs_per_carton, unit_price_rmb
  )
  values (
    p_shipment_id, upper(btrim(p_sku)), p_cartons, p_pcs_per_carton, p_unit_price_rmb
  )
  returning id into v_item_id;
  return jsonb_build_object('id', v_item_id);
end
$function$;

create or replace function public.web_receive_shipment(p_shipment_id integer)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_code text;
  v_lines integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;

  if not exists (select 1 from public.shipment_items where shipment_id = p_shipment_id) then
    raise exception 'Ajoutez les articles du container avant de le réceptionner';
  end if;
  update public.shipments
  set arrived = true
  where id = p_shipment_id and arrived is distinct from true
  returning code into v_code;
  if v_code is null then
    if exists (select 1 from public.shipments where id = p_shipment_id) then
      return jsonb_build_object('received', false, 'message', 'Container déjà reçu');
    end if;
    raise exception 'Container introuvable';
  end if;

  insert into public.stock_movements(mv_date, sku, qty, type, note, shipment_id)
  select current_date, si.sku, si.total_pcs, 'arrivage', 'Réception ' || v_code, si.shipment_id
  from public.shipment_items si
  where si.shipment_id = p_shipment_id;
  get diagnostics v_lines = row_count;
  return jsonb_build_object('received', true, 'code', v_code, 'lines_added', v_lines);
end
$function$;

create or replace function public.web_create_sale(
  p_sale_date date,
  p_customer_id integer,
  p_items jsonb,
  p_paid numeric,
  p_note text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_sale_id integer;
  v_total numeric;
  v_item record;
  v_stock numeric;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_sale_date is null or p_paid is null or p_paid < 0
     or p_customer_id is null or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Date, articles et montant encaissé doivent être valides';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Client introuvable';
  end if;

  select sum((item->>'qty')::integer * (item->>'unit_price')::numeric)
  into v_total
  from jsonb_array_elements(p_items) as rows(item);
  if v_total is null or v_total <= 0 or p_paid > v_total then
    raise exception 'Le total ou le montant encaissé est invalide';
  end if;

  for v_item in
    select item->>'sku' as sku, sum((item->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_items) as rows(item)
    group by item->>'sku'
    order by item->>'sku'
  loop
    if v_item.sku is null or v_item.qty < 1 then
      raise exception 'Article ou quantité invalide';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_item.sku, 0));
    select coalesce(sum(
      case
        when sm.type = 'arrivage' then abs(sm.qty)
        when sm.type in ('vente', 'casse') then -abs(sm.qty)
        else sm.qty
      end
    ), 0)
    into v_stock
    from public.stock_movements sm
    where sm.sku = v_item.sku;
    if v_stock < v_item.qty then
      raise exception 'Stock insuffisant pour % (disponible: %, demandé: %)',
        v_item.sku, v_stock, v_item.qty;
    end if;
  end loop;

  insert into public.sales(sale_date, customer_id, total_tnd, note)
  values (p_sale_date, p_customer_id, v_total, nullif(btrim(p_note), ''))
  returning id into v_sale_id;

  insert into public.sale_items(sale_id, sku, qty, unit_price_tnd)
  select v_sale_id, item->>'sku', (item->>'qty')::integer, (item->>'unit_price')::numeric
  from jsonb_array_elements(p_items) as rows(item);

  insert into public.stock_movements(mv_date, sku, qty, type, note, sale_id)
  select p_sale_date, item->>'sku', (item->>'qty')::integer, 'vente',
         'Vente n°' || v_sale_id, v_sale_id
  from jsonb_array_elements(p_items) as rows(item);

  if p_paid > 0 then
    insert into public.payments(pay_date, customer_id, sale_id, amount_tnd, note)
    values (p_sale_date, p_customer_id, v_sale_id, p_paid, 'Encaissement vente n°' || v_sale_id);
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'total_tnd', v_total, 'paid_tnd', p_paid);
end
$function$;

create or replace function public.web_create_payment(
  p_pay_date date,
  p_customer_id integer,
  p_amount numeric,
  p_method text,
  p_note text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_pay_date is null or p_customer_id is null
     or p_amount is null or p_amount <= 0 then
    raise exception 'La date et le montant du paiement sont obligatoires';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Client introuvable';
  end if;

  insert into public.payments(pay_date, customer_id, amount_tnd, method, note)
  values (p_pay_date, p_customer_id, p_amount, nullif(btrim(p_method), ''),
          nullif(btrim(p_note), ''))
  returning id into v_id;
  return jsonb_build_object('payment_id', v_id);
end
$function$;

create or replace function public.web_add_movement(
  p_mv_date date,
  p_sku text,
  p_qty integer,
  p_type text,
  p_note text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id integer;
  v_stock numeric;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_mv_date is null or p_qty = 0 or p_type not in ('casse', 'ajustement') then
    raise exception 'Date, quantité et type de mouvement doivent être valides';
  end if;
  if not exists (select 1 from public.products where sku = p_sku) then
    raise exception 'Produit introuvable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_sku, 0));
  select coalesce(sum(
    case
      when type = 'arrivage' then abs(qty)
      when type in ('vente', 'casse') then -abs(qty)
      else qty
    end
  ), 0)
  into v_stock from public.stock_movements where sku = p_sku;
  if v_stock + (case when p_type = 'casse' then -abs(p_qty) else p_qty end) < 0 then
    raise exception 'Stock insuffisant (disponible: %, variation: %)', v_stock, p_qty;
  end if;

  insert into public.stock_movements(mv_date, sku, qty, type, note)
  values (p_mv_date, p_sku,
          case when p_type = 'casse' then abs(p_qty) else p_qty end,
          p_type, nullif(btrim(p_note), ''))
  returning id into v_id;
  return jsonb_build_object('movement_id', v_id);
end
$function$;

create or replace function public.web_add_shipment_cost(
  p_shipment_id integer,
  p_cost_date date,
  p_type text,
  p_label text,
  p_amount numeric,
  p_currency text,
  p_fx_to_tnd numeric,
  p_basis text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_cost_date is null or p_amount <= 0 or p_fx_to_tnd <= 0
     or p_currency not in ('RMB', 'USD', 'TND')
     or p_basis not in ('value', 'cbm', 'pcs') then
    raise exception 'Date, montant, devise ou répartition des frais invalide';
  end if;
  if not exists (select 1 from public.shipments where id = p_shipment_id) then
    raise exception 'Container introuvable';
  end if;

  insert into public.shipment_costs(
    shipment_id, cost_date, type, label, amount, currency, fx_to_tnd, basis
  )
  values (p_shipment_id, p_cost_date, p_type, nullif(btrim(p_label), ''),
          p_amount, p_currency, p_fx_to_tnd, p_basis)
  returning id into v_id;
  return jsonb_build_object('cost_id', v_id);
end
$function$;

do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'web_save_product(text,text,text,integer,numeric)',
    'web_save_customer(text,text,text)',
    'web_save_shipment(text,date,numeric,text)',
    'web_set_shipment_fx(integer,numeric)',
    'web_add_shipment_item(integer,text,text,integer,integer,numeric)',
    'web_receive_shipment(integer)',
    'web_create_sale(date,integer,jsonb,numeric,text)',
    'web_create_payment(date,integer,numeric,text,text)',
    'web_add_movement(date,text,integer,text,text)',
    'web_add_shipment_cost(integer,date,text,text,numeric,text,numeric,text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', function_name);
    execute format('grant execute on function public.%s to authenticated', function_name);
  end loop;
end
$$;
