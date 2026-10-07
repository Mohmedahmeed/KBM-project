create table if not exists public.web_shipment_imports (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  request_payload jsonb not null,
  shipment_id integer references public.shipments(id),
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.web_shipment_imports enable row level security;
revoke all on table public.web_shipment_imports from public, anon, authenticated;

create or replace function public.web_import_received_shipment(
  p_request_id uuid,
  p_code text,
  p_ship_date date,
  p_received_date date,
  p_fx_rmb_tnd numeric,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_saved_actor uuid;
  v_code text;
  v_payload jsonb;
  v_saved_payload jsonb;
  v_saved_result jsonb;
  v_shipment_id integer;
  v_product_sku text;
  v_products_created integer := 0;
  v_line_count integer;
  v_total_cartons bigint := 0;
  v_total_pieces bigint := 0;
  v_line record;
  v_unit_price numeric;
  v_cartons integer;
  v_pcs_per_carton integer;
  v_total_pcs integer;
  v_image_path text;
  v_row_count integer;
  v_result jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if p_request_id is null or v_code !~ '^[A-Z0-9][A-Z0-9 _-]{1,20}$'
     or p_ship_date is null or p_received_date is null
     or p_received_date < p_ship_date
     or (p_fx_rmb_tnd is not null and p_fx_rmb_tnd <= 0)
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Invalid import: vérifiez le code, les dates, le taux et les lignes.';
  end if;
  if jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 1000 then
    raise exception 'Invalid import: le nombre de lignes est invalide.';
  end if;

  v_payload := jsonb_build_object(
    'code', v_code,
    'ship_date', p_ship_date,
    'received_date', p_received_date,
    'fx_rmb_tnd', p_fx_rmb_tnd,
    'lines', p_lines
  );

  insert into public.web_shipment_imports(request_id, actor_id, request_payload)
  values (p_request_id, v_actor, v_payload)
  on conflict (request_id) do nothing;

  select wi.actor_id, wi.request_payload, wi.result
  into v_saved_actor, v_saved_payload, v_saved_result
  from public.web_shipment_imports wi
  where wi.request_id = p_request_id
  for update;

  if v_saved_actor is distinct from v_actor or v_saved_payload is distinct from v_payload then
    raise exception 'The idempotency key was used for a different import';
  end if;
  if v_saved_result is not null then
    return v_saved_result;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) as rows(line)
    group by upper(btrim(line->>'sku'))
    having count(*) > 1
  ) then
    raise exception 'Invalid import: un SKU apparaît plusieurs fois dans le classeur.';
  end if;

  for v_line in
    select line
    from jsonb_array_elements(p_lines) as rows(line)
  loop
    if jsonb_typeof(v_line.line) <> 'object'
       or coalesce(v_line.line->>'sku', '') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
       or coalesce(v_line.line->>'cartons', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_line.line->>'pcs_per_carton', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_line.line->>'unit_price_rmb', '') !~ '^[0-9]+([.][0-9]+)?$'
       or coalesce(v_line.line->>'amount_rmb', '') !~ '^[0-9]+([.][0-9]+)?$'
       or (v_line.line->>'cbm_total' is not null and v_line.line->>'cbm_total' !~ '^[0-9]+([.][0-9]+)?$')
       or (v_line.line->>'gross_weight_total' is not null and v_line.line->>'gross_weight_total' !~ '^[0-9]+([.][0-9]+)?$')
       or (
         v_line.line->>'image_path' is not null
         and v_line.line->>'image_path' !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[.]webp$'
       ) then
      raise exception 'Invalid import: une ligne contient des champs manquants ou invalides.';
    end if;

    if (v_line.line->>'cartons')::numeric > 2147483647
       or (v_line.line->>'pcs_per_carton')::numeric > 2147483647 then
      raise exception 'Invalid import: une quantité dépasse la limite du système.';
    end if;
    v_cartons := (v_line.line->>'cartons')::integer;
    v_pcs_per_carton := (v_line.line->>'pcs_per_carton')::integer;
    if (v_cartons::bigint * v_pcs_per_carton::bigint) > 2147483647
       or (v_line.line->>'amount_rmb')::numeric <>
          v_cartons::numeric * v_pcs_per_carton::numeric *
          (v_line.line->>'unit_price_rmb')::numeric then
      raise exception 'Invalid import: les quantités ou le montant RMB d’une ligne ne concordent pas.';
    end if;
    v_total_pcs := v_cartons * v_pcs_per_carton;
    v_total_cartons := v_total_cartons + v_cartons;
    v_total_pieces := v_total_pieces + v_total_pcs;
  end loop;
  v_line_count := jsonb_array_length(p_lines);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shipment:' || v_code, 0)
  );
  if exists (select 1 from public.shipments s where upper(s.code) = v_code) then
    raise exception 'Container already exists';
  end if;

  insert into public.shipments(code, ship_date, fx_rmb_tnd, arrived, notes)
  values (v_code, p_ship_date, p_fx_rmb_tnd, true, 'Import packing list Excel')
  returning id into v_shipment_id;

  for v_line in
    select line
    from jsonb_array_elements(p_lines) as rows(line)
    order by upper(btrim(line->>'sku'))
  loop
    select p.sku into v_product_sku
    from public.products p
    where upper(p.sku) = upper(btrim(v_line.line->>'sku'))
    order by p.sku
    limit 1;
    if not found then
      v_product_sku := upper(btrim(v_line.line->>'sku'));
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_product_sku, 0)
    );
    select p.sku into v_product_sku
    from public.products p
    where p.sku = v_product_sku
    for update;

    if not found then
      v_product_sku := upper(btrim(v_line.line->>'sku'));
      insert into public.products(sku, name, pcs_per_carton)
      values (v_product_sku, nullif(btrim(v_line.line->>'source_name'), ''), (v_line.line->>'pcs_per_carton')::integer)
      on conflict (sku) do nothing;
      get diagnostics v_row_count = row_count;
      v_products_created := v_products_created + v_row_count;
      if v_row_count = 0 then
        select p.sku into v_product_sku
        from public.products p
        where upper(p.sku) = upper(btrim(v_line.line->>'sku'))
        order by p.sku
        limit 1
        for update;
      end if;
    end if;

    v_image_path := v_line.line->>'image_path';
    if v_image_path is not null then
      update public.products p
      set image_path = v_image_path
      where p.sku = v_product_sku and p.image_path is null;
    end if;

    v_unit_price := (v_line.line->>'unit_price_rmb')::numeric;
    v_cartons := (v_line.line->>'cartons')::integer;
    v_pcs_per_carton := (v_line.line->>'pcs_per_carton')::integer;
    insert into public.shipment_items(
      shipment_id, sku, cartons, pcs_per_carton, unit_price_rmb, cbm_total, gw_total
    )
    values (
      v_shipment_id,
      v_product_sku,
      v_cartons,
      v_pcs_per_carton,
      v_unit_price,
      nullif(v_line.line->>'cbm_total', '')::numeric,
      nullif(v_line.line->>'gross_weight_total', '')::numeric
    );

    insert into public.stock_movements(mv_date, sku, qty, type, note, shipment_id)
    values (
      p_received_date,
      v_product_sku,
      v_cartons * v_pcs_per_carton,
      'arrivage',
      'Réception ' || v_code,
      v_shipment_id
    );
  end loop;

  v_result := jsonb_build_object(
    'shipment_id', v_shipment_id,
    'code', v_code,
    'product_count', v_products_created,
    'line_count', v_line_count,
    'total_cartons', v_total_cartons,
    'total_pieces', v_total_pieces
  );
  update public.web_shipment_imports
  set shipment_id = v_shipment_id, result = v_result
  where request_id = p_request_id;

  return v_result;
end
$function$;

revoke all on function public.web_import_received_shipment(uuid, text, date, date, numeric, jsonb)
  from public, anon;
grant execute on function public.web_import_received_shipment(uuid, text, date, date, numeric, jsonb)
  to authenticated;
