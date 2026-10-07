alter table public.products
  add column if not exists color text;

create or replace function public.web_save_product(
  p_sku text,
  p_name text,
  p_name_fr text,
  p_name_ar text,
  p_size text,
  p_pcs_per_carton integer,
  p_sale_price numeric,
  p_image_path text,
  p_color text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if nullif(btrim(p_sku), '') is null or p_pcs_per_carton is null
     or p_pcs_per_carton < 1
     or p_sale_price < 0 or p_sale_price > 99999999999.999
     or round(p_sale_price, 3) <> p_sale_price
     or length(btrim(coalesce(p_name_fr, ''))) > 250
     or length(btrim(coalesce(p_name_ar, ''))) > 250
     or length(btrim(coalesce(p_size, ''))) > 100
     or length(btrim(coalesce(p_color, ''))) > 100
     or (p_image_path is not null and p_image_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[.](jpg|png|webp)$') then
    raise exception 'SKU, pièces par carton, prix ou attribut produit doivent être valides';
  end if;

  insert into public.products(
    sku, name, name_fr, name_ar, size, pcs_per_carton, sale_price, image_path, color
  )
  values (
    upper(btrim(p_sku)), nullif(btrim(p_name), ''),
    nullif(btrim(p_name_fr), ''), nullif(btrim(p_name_ar), ''),
    nullif(btrim(p_size), ''), p_pcs_per_carton, p_sale_price, p_image_path,
    nullif(btrim(p_color), '')
  )
  on conflict (sku) do update
  set name = coalesce(nullif(btrim(excluded.name), ''), products.name),
      name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      size = excluded.size,
      pcs_per_carton = excluded.pcs_per_carton,
      sale_price = excluded.sale_price,
      image_path = coalesce(excluded.image_path, products.image_path),
      color = excluded.color;

  return jsonb_build_object('sku', upper(btrim(p_sku)));
end
$function$;

revoke all on function public.web_save_product(text, text, text, text, text, integer, numeric, text, text)
  from anon, public;
grant execute on function public.web_save_product(text, text, text, text, text, integer, numeric, text, text)
  to authenticated;
