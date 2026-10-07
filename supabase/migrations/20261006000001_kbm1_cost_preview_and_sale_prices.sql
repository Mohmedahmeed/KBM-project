create or replace function public.kbm_calculate_shipment_import_pricing(
  p_fx_rmb_tnd numeric,
  p_additional_costs_tnd numeric,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line record;
  v_sku text;
  v_quantity integer;
  v_cartons integer;
  v_pcs_per_carton integer;
  v_unit_price_rmb numeric;
  v_amount_rmb numeric;
  v_sale_price numeric;
  v_current_sale_price numeric;
  v_matching_products integer;
  v_source_total numeric := 0;
  v_total_cartons bigint := 0;
  v_total_pieces bigint := 0;
  v_total_sale numeric := 0;
  v_priced_lines integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_expense_share numeric;
  v_unit_cost numeric;
  v_sale_total numeric;
  v_markup numeric;
  v_cost_ready boolean;
  v_cost_factor numeric;
begin
  if auth.uid() is null or not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 1000 then
    raise exception 'Invalid import: le nombre de lignes est invalide.';
  end if;
  if (p_fx_rmb_tnd is not null and
      (p_fx_rmb_tnd <= 0 or p_fx_rmb_tnd > 1000000
       or round(p_fx_rmb_tnd, 6) <> p_fx_rmb_tnd))
     or (p_additional_costs_tnd is not null
         and (p_additional_costs_tnd < 0 or p_additional_costs_tnd > 99999999999.999
              or round(p_additional_costs_tnd, 3) <> p_additional_costs_tnd)) then
    raise exception 'Invalid import: le taux ou les frais en TND sont hors limites.';
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
       or coalesce(v_line.line->>'cartons', '') !~ '^[1-9][0-9]{0,9}$'
       or coalesce(v_line.line->>'pcs_per_carton', '') !~ '^[1-9][0-9]{0,9}$'
       or coalesce(v_line.line->>'unit_price_rmb', '') !~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
       or coalesce(v_line.line->>'amount_rmb', '') !~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
       or (v_line.line->>'source_name' is not null and length(v_line.line->>'source_name') > 2000)
       or (v_line.line->>'cbm_total' is not null
           and v_line.line->>'cbm_total' !~ '^[0-9]{1,12}([.][0-9]{1,6})?$')
       or (v_line.line->>'gross_weight_total' is not null
           and v_line.line->>'gross_weight_total' !~ '^[0-9]{1,12}([.][0-9]{1,6})?$')
       or (
         v_line.line->>'sale_price_tnd' is not null
         and v_line.line->>'sale_price_tnd' !~ '^[0-9]{1,11}([.][0-9]{1,3})?$'
       )
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
    if v_cartons::bigint * v_pcs_per_carton::bigint > 2147483647 then
      raise exception 'Invalid import: une quantité dépasse la limite du système.';
    end if;
    v_quantity := v_cartons * v_pcs_per_carton;
    v_unit_price_rmb := (v_line.line->>'unit_price_rmb')::numeric;
    v_amount_rmb := (v_line.line->>'amount_rmb')::numeric;
    if v_amount_rmb <> v_quantity::numeric * v_unit_price_rmb then
      raise exception 'Invalid import: le montant RMB d’une ligne ne correspond pas à son prix et sa quantité.';
    end if;

    v_sku := upper(btrim(v_line.line->>'sku'));
    select count(*), min(p.sale_price)
    into v_matching_products, v_current_sale_price
    from public.products p
    where upper(p.sku) = v_sku;
    if v_matching_products > 1 then
      raise exception 'Invalid import: le catalogue contient plusieurs produits avec le même SKU.';
    end if;

    v_sale_price := case
      when v_line.line->>'sale_price_tnd' is not null
        then (v_line.line->>'sale_price_tnd')::numeric
      else v_current_sale_price
    end;
    v_expense_share := null;
    v_unit_cost := null;
    v_sale_total := null;
    v_markup := null;

    v_source_total := v_source_total + v_amount_rmb;
    v_total_cartons := v_total_cartons + v_cartons;
    v_total_pieces := v_total_pieces + v_quantity;

    if v_sale_price is not null then
      v_sale_total := round(v_quantity::numeric * v_sale_price, 3);
      v_total_sale := v_total_sale + v_sale_total;
      v_priced_lines := v_priced_lines + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'sku', v_sku,
      'cartons', v_cartons,
      'total_pieces', v_quantity,
      'source_amount_rmb', v_amount_rmb::text,
      'sale_price_tnd', case when v_sale_price is null then null else round(v_sale_price, 3)::text end,
      'sale_total_tnd', case when v_sale_total is null then null else v_sale_total::text end,
      'expense_share_tnd', null,
      'landed_unit_cost_tnd', null,
      'markup_percent', null
    ));
  end loop;

  v_cost_ready := p_fx_rmb_tnd is not null and p_additional_costs_tnd is not null;
  if v_cost_ready and v_source_total <= 0 then
    raise exception 'Invalid import: impossible de répartir les frais sur une facture de valeur nulle.';
  end if;

  if v_cost_ready then
    for v_line in
      select line, ordinality
      from jsonb_array_elements(p_lines) with ordinality as rows(line, ordinality)
    loop
      v_sku := upper(btrim(v_line.line->>'sku'));
      v_cartons := (v_line.line->>'cartons')::integer;
      v_quantity := v_cartons * (v_line.line->>'pcs_per_carton')::integer;
      v_amount_rmb := (v_line.line->>'amount_rmb')::numeric;
      v_expense_share := p_additional_costs_tnd * v_amount_rmb / v_source_total;
      v_unit_cost := round(
        (v_amount_rmb * p_fx_rmb_tnd + v_expense_share) / v_quantity,
        3
      );
      v_sale_price := case
        when v_line.line->>'sale_price_tnd' is not null
          then (v_line.line->>'sale_price_tnd')::numeric
        else (
          select p.sale_price
          from public.products p
          where upper(p.sku) = v_sku
        )
      end;
      v_sale_total := case
        when v_sale_price is null then null
        else round(v_quantity::numeric * v_sale_price, 3)
      end;
      v_markup := case
        when v_sale_price is null or v_unit_cost <= 0 then null
        else round((v_sale_price - v_unit_cost) / v_unit_cost * 100, 2)
      end;

      v_rows := jsonb_set(
        v_rows,
        array[(v_line.ordinality - 1)::text],
        jsonb_build_object(
          'sku', v_sku,
          'cartons', v_cartons,
          'total_pieces', v_quantity,
          'source_amount_rmb', v_amount_rmb::text,
          'sale_price_tnd', case when v_sale_price is null then null else round(v_sale_price, 3)::text end,
          'sale_total_tnd', case when v_sale_total is null then null else v_sale_total::text end,
          'expense_share_tnd', round(v_expense_share, 3)::text,
          'landed_unit_cost_tnd', v_unit_cost::text,
          'markup_percent', case when v_markup is null then null else v_markup::text end
        ),
        false
      );
    end loop;
    v_cost_factor := round(
      (v_source_total * p_fx_rmb_tnd + p_additional_costs_tnd)
      / (v_source_total * p_fx_rmb_tnd),
      6
    );
  end if;

  return jsonb_build_object(
    'lines', v_rows,
    'line_count', jsonb_array_length(p_lines),
    'priced_line_count', v_priced_lines,
    'unpriced_line_count', jsonb_array_length(p_lines) - v_priced_lines,
    'total_cartons', v_total_cartons,
    'total_pieces', v_total_pieces,
    'source_total_rmb', v_source_total::text,
    'invoice_total_tnd', case
      when p_fx_rmb_tnd is null then null
      else round(v_source_total * p_fx_rmb_tnd, 3)::text
    end,
    'additional_costs_tnd', case
      when p_additional_costs_tnd is null then null
      else round(p_additional_costs_tnd, 3)::text
    end,
    'landed_total_tnd', case
      when not v_cost_ready then null
      else round(v_source_total * p_fx_rmb_tnd + p_additional_costs_tnd, 3)::text
    end,
    'cost_factor', case when v_cost_factor is null then null else v_cost_factor::text end,
    'priced_sale_total_tnd', case
      when v_priced_lines = 0 then null
      else round(v_total_sale, 3)::text
    end,
    'cost_ready', v_cost_ready
  );
end
$function$;

create or replace function public.web_preview_received_shipment_pricing(
  p_fx_rmb_tnd numeric,
  p_additional_costs_tnd numeric,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  return public.kbm_calculate_shipment_import_pricing(
    p_fx_rmb_tnd,
    p_additional_costs_tnd,
    p_lines
  );
end
$function$;

drop function if exists public.web_import_received_shipment(uuid, text, date, date, numeric, jsonb);

create or replace function public.web_import_received_shipment(
  p_request_id uuid,
  p_code text,
  p_ship_date date,
  p_received_date date,
  p_fx_rmb_tnd numeric,
  p_additional_costs_tnd numeric,
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
  v_line record;
  v_pricing jsonb;
  v_unit_price numeric;
  v_cartons integer;
  v_pcs_per_carton integer;
  v_image_path text;
  v_row_count integer;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if p_request_id is null or v_code !~ '^[A-Z0-9][A-Z0-9 _-]{1,20}$'
     or p_ship_date is null or p_received_date is null
     or p_received_date < p_ship_date
     or (p_fx_rmb_tnd is not null and
         (p_fx_rmb_tnd <= 0 or p_fx_rmb_tnd > 1000000
          or round(p_fx_rmb_tnd, 6) <> p_fx_rmb_tnd))
     or (p_additional_costs_tnd is not null and
         (p_additional_costs_tnd < 0 or p_additional_costs_tnd > 99999999999.999
          or round(p_additional_costs_tnd, 3) <> p_additional_costs_tnd))
     or p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 1000 then
    raise exception 'Invalid import: vérifiez le code, les dates, le taux, les frais et les lignes.';
  end if;

  v_payload := jsonb_build_object(
    'code', v_code,
    'ship_date', p_ship_date,
    'received_date', p_received_date,
    'fx_rmb_tnd', p_fx_rmb_tnd,
    'additional_costs_tnd', p_additional_costs_tnd,
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

  v_pricing := public.kbm_calculate_shipment_import_pricing(
    p_fx_rmb_tnd,
    p_additional_costs_tnd,
    p_lines
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shipment:' || v_code, 0)
  );
  if exists (select 1 from public.shipments s where upper(s.code) = v_code) then
    raise exception 'Container already exists';
  end if;

  insert into public.shipments(code, ship_date, fx_rmb_tnd, arrived, notes)
  values (v_code, p_ship_date, p_fx_rmb_tnd, true, 'Import packing list Excel')
  returning id into v_shipment_id;

  if p_additional_costs_tnd is not null then
    insert into public.shipment_costs(
      shipment_id, cost_date, type, label, amount, currency, fx_to_tnd, basis
    )
    values (
      v_shipment_id,
      p_received_date,
      'import_cost',
      'Frais et douane déclarés pour l’import',
      p_additional_costs_tnd,
      'TND',
      1,
      'value'
    );
  end if;

  for v_line in
    select line, ordinality
    from jsonb_array_elements(p_lines) with ordinality as rows(line, ordinality)
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
      insert into public.products(sku, name, pcs_per_carton, sale_price)
      values (
        v_product_sku,
        nullif(btrim(v_line.line->>'source_name'), ''),
        (v_line.line->>'pcs_per_carton')::integer,
        nullif(v_line.line->>'sale_price_tnd', '')::numeric
      )
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
    elsif nullif(v_line.line->>'sale_price_tnd', '') is not null then
      update public.products p
      set sale_price = (v_line.line->>'sale_price_tnd')::numeric
      where p.sku = v_product_sku;
    end if;

    v_image_path := v_line.line->>'image_path';
    if v_image_path is not null then
      if v_image_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[.]webp$'
         or not exists (
           select 1 from storage.objects o
           where o.bucket_id = 'product-images' and o.name = v_image_path
         ) then
        raise exception 'Invalid import: une photo n’est pas présente dans le stockage privé.';
      end if;
      update public.products p
      set image_path = v_image_path
      where p.sku = v_product_sku and p.image_path is null;
    end if;

    v_cartons := (v_line.line->>'cartons')::integer;
    v_pcs_per_carton := (v_line.line->>'pcs_per_carton')::integer;
    v_unit_price := (v_line.line->>'unit_price_rmb')::numeric;
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

  v_saved_result := v_pricing || jsonb_build_object(
    'shipment_id', v_shipment_id,
    'code', v_code,
    'product_count', v_products_created
  );
  update public.web_shipment_imports
  set shipment_id = v_shipment_id, result = v_saved_result
  where request_id = p_request_id;

  return v_saved_result;
end
$function$;

revoke all on function public.kbm_calculate_shipment_import_pricing(numeric, numeric, jsonb)
  from public, anon, authenticated;
revoke all on function public.web_preview_received_shipment_pricing(numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.web_preview_received_shipment_pricing(numeric, numeric, jsonb)
  to authenticated;
revoke all on function public.web_import_received_shipment(uuid, text, date, date, numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.web_import_received_shipment(uuid, text, date, date, numeric, numeric, jsonb)
  to authenticated;
