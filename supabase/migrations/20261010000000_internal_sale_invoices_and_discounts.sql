alter table public.sales
  add column if not exists invoice_number text,
  add column if not exists subtotal_tnd numeric,
  add column if not exists discount_percent numeric(5, 2) not null default 0,
  add column if not exists discount_tnd numeric(14, 3) not null default 0,
  add column if not exists request_id uuid,
  add column if not exists request_payload jsonb,
  add column if not exists created_by uuid references auth.users(id);

update public.sales
set subtotal_tnd = total_tnd
where subtotal_tnd is null;

with numbered_sales as (
  select
    s.id,
    extract(year from s.sale_date)::integer as invoice_year,
    row_number() over (
      partition by extract(year from s.sale_date)::integer
      order by s.id
    ) as invoice_sequence
  from public.sales s
  where s.invoice_number is null
)
update public.sales s
set invoice_number = 'INT-' || ns.invoice_year::text || '-' || lpad(ns.invoice_sequence::text, 5, '0')
from numbered_sales ns
where s.id = ns.id;

create table if not exists public.sale_invoice_counters (
  invoice_year integer primary key,
  last_number bigint not null check (last_number > 0)
);
alter table public.sale_invoice_counters enable row level security;
revoke all on table public.sale_invoice_counters from public, anon, authenticated;

insert into public.sale_invoice_counters as current_counter(invoice_year, last_number)
select
  extract(year from s.sale_date)::integer,
  max(split_part(s.invoice_number, '-', 3)::bigint)
from public.sales s
group by extract(year from s.sale_date)::integer
on conflict (invoice_year) do update
set last_number = greatest(current_counter.last_number, excluded.last_number);

alter table public.sales
  alter column invoice_number set not null,
  alter column subtotal_tnd set not null;

create unique index if not exists sales_invoice_number_uidx
  on public.sales(invoice_number);
create unique index if not exists sales_request_id_uidx
  on public.sales(request_id)
  where request_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'sales_discount_values_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_discount_values_check
      check (
        discount_percent >= 0
        and discount_percent <= 100
        and round(discount_percent, 2) = discount_percent
        and subtotal_tnd >= 0
        and discount_tnd >= 0
        and discount_tnd <= subtotal_tnd
        and total_tnd = subtotal_tnd - discount_tnd
      ) not valid;
  end if;
end
$$;

create table if not exists public.management_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id integer not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.management_audit_events enable row level security;
revoke all on table public.management_audit_events from public, anon, authenticated;

revoke all on function public.web_create_sale(date, integer, jsonb, numeric, text)
  from public, anon;
drop function if exists public.web_create_sale(date, integer, jsonb, numeric, text);

create or replace function public.web_create_sale(
  p_request_id uuid,
  p_sale_date date,
  p_customer_id integer,
  p_items jsonb,
  p_discount_percent numeric,
  p_paid numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_payload jsonb;
  v_normalized_items jsonb;
  v_sale_id integer;
  v_invoice_year integer;
  v_invoice_sequence bigint;
  v_invoice_number text;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_stock numeric;
  v_item record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.kbm_is_admin() then
    raise exception using errcode = 'P0001', message = 'sale_access_denied';
  end if;

  if p_request_id is null
     or p_sale_date is null
     or p_customer_id is null
     or p_discount_percent is null
     or p_discount_percent < 0
     or p_discount_percent > 100
     or round(p_discount_percent, 2) <> p_discount_percent
     or p_paid is null
     or p_paid < 0
     or p_paid > 99999999999.999
     or round(p_paid, 3) <> p_paid
     or length(btrim(coalesce(p_note, ''))) > 1000
     or p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 1000 then
    raise exception using errcode = 'P0001', message = 'sale_invalid_input';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception using errcode = 'P0001', message = 'sale_invalid_customer';
  end if;

  for v_item in
    select line
    from pg_catalog.jsonb_array_elements(p_items) as rows(line)
  loop
    if pg_catalog.jsonb_typeof(v_item.line) <> 'object'
       or coalesce(v_item.line->>'sku', '') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
       or coalesce(v_item.line->>'qty', '') !~ '^[1-9][0-9]{0,9}$'
       or coalesce(v_item.line->>'unit_price', '') !~ '^(0|[1-9][0-9]{0,10})([.][0-9]{1,3})?$'
       or (v_item.line->>'qty')::numeric > 2147483647
       or (v_item.line->>'unit_price')::numeric > 99999999999.999 then
      raise exception using errcode = 'P0001', message = 'sale_invalid_input';
    end if;
  end loop;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'sku', upper(btrim(line->>'sku')),
      'qty', (line->>'qty')::integer,
      'unit_price', (line->>'unit_price')::numeric
    )
    order by upper(btrim(line->>'sku')), (line->>'qty')::integer, (line->>'unit_price')::numeric
  )
  into v_normalized_items
  from pg_catalog.jsonb_array_elements(p_items) as rows(line);

  v_payload := pg_catalog.jsonb_build_object(
    'sale_date', p_sale_date,
    'customer_id', p_customer_id,
    'items', v_normalized_items,
    'discount_percent', p_discount_percent,
    'paid', p_paid,
    'note', nullif(btrim(p_note), '')
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sale-request:' || p_request_id::text, 0)
  );

  select s.created_by, s.request_payload
  into v_existing_actor, v_existing_payload
  from public.sales s
  where s.request_id = p_request_id
  for update;

  if found then
    if v_existing_actor is distinct from v_actor or v_existing_payload is distinct from v_payload then
      raise exception using errcode = 'P0001', message = 'sale_request_conflict';
    end if;
    select s.id, s.invoice_number, s.subtotal_tnd, s.discount_tnd, s.total_tnd
    into v_sale_id, v_invoice_number, v_subtotal, v_discount, v_total
    from public.sales s
    where s.request_id = p_request_id;
    return pg_catalog.jsonb_build_object(
      'sale_id', v_sale_id,
      'invoice_number', v_invoice_number,
      'subtotal_tnd', v_subtotal::text,
      'discount_tnd', v_discount::text,
      'total_tnd', v_total::text,
      'paid_tnd', p_paid::text
    );
  end if;

  select pg_catalog.sum((line->>'qty')::numeric * (line->>'unit_price')::numeric)
  into v_subtotal
  from pg_catalog.jsonb_array_elements(v_normalized_items) as rows(line);
  if v_subtotal is null or v_subtotal <= 0 or v_subtotal > 99999999999.999
     or pg_catalog.round(v_subtotal, 3) <> v_subtotal then
    raise exception using errcode = 'P0001', message = 'sale_invalid_input';
  end if;

  v_discount := pg_catalog.round(v_subtotal * p_discount_percent / 100, 3);
  v_total := v_subtotal - v_discount;
  if p_paid > v_total then
    raise exception using errcode = 'P0001', message = 'sale_invalid_payment';
  end if;

  for v_item in
    select line->>'sku' as sku, pg_catalog.sum((line->>'qty')::bigint)::bigint as qty
    from pg_catalog.jsonb_array_elements(v_normalized_items) as rows(line)
    group by line->>'sku'
    order by line->>'sku'
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_item.sku, 0)
    );
    select coalesce(pg_catalog.sum(
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
      raise exception using errcode = 'P0001', message = 'sale_insufficient_stock';
    end if;
    if not exists (select 1 from public.products p where p.sku = v_item.sku) then
      raise exception using errcode = 'P0001', message = 'sale_invalid_product';
    end if;
  end loop;

  v_invoice_year := extract(year from p_sale_date)::integer;
  insert into public.sale_invoice_counters(invoice_year, last_number)
  values (v_invoice_year, 1)
  on conflict (invoice_year) do update
  set last_number = public.sale_invoice_counters.last_number + 1
  returning last_number into v_invoice_sequence;
  v_invoice_number := 'INT-' || v_invoice_year::text || '-' || pg_catalog.lpad(v_invoice_sequence::text, 5, '0');

  insert into public.sales(
    invoice_number, request_id, request_payload, created_by,
    sale_date, customer_id, subtotal_tnd, discount_percent, discount_tnd, total_tnd, note
  )
  values (
    v_invoice_number, p_request_id, v_payload, v_actor,
    p_sale_date, p_customer_id, v_subtotal, p_discount_percent, v_discount, v_total,
    nullif(btrim(p_note), '')
  )
  returning id into v_sale_id;

  insert into public.sale_items(sale_id, sku, qty, unit_price_tnd)
  select v_sale_id, line->>'sku', (line->>'qty')::integer, (line->>'unit_price')::numeric
  from pg_catalog.jsonb_array_elements(v_normalized_items) as rows(line);

  insert into public.stock_movements(mv_date, sku, qty, type, note, sale_id)
  select p_sale_date, line->>'sku', (line->>'qty')::integer, 'vente',
         'Vente ' || v_invoice_number, v_sale_id
  from pg_catalog.jsonb_array_elements(v_normalized_items) as rows(line);

  if p_paid > 0 then
    insert into public.payments(pay_date, customer_id, sale_id, amount_tnd, note)
    values (p_sale_date, p_customer_id, v_sale_id, p_paid, 'Encaissement ' || v_invoice_number);
  end if;

  insert into public.management_audit_events(
    actor_id, event_type, entity_type, entity_id, event_data
  )
  values (
    v_actor,
    'sale.created',
    'sale',
    v_sale_id,
    pg_catalog.jsonb_build_object(
      'invoice_number', v_invoice_number,
      'subtotal_tnd', v_subtotal::text,
      'discount_percent', p_discount_percent::text,
      'discount_tnd', v_discount::text,
      'total_tnd', v_total::text,
      'paid_tnd', p_paid::text
    )
  );

  return pg_catalog.jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'subtotal_tnd', v_subtotal::text,
    'discount_tnd', v_discount::text,
    'total_tnd', v_total::text,
    'paid_tnd', p_paid::text
  );
end
$function$;

revoke all on function public.web_create_sale(uuid, date, integer, jsonb, numeric, numeric, text)
  from public, anon;
grant execute on function public.web_create_sale(uuid, date, integer, jsonb, numeric, numeric, text)
  to authenticated;
