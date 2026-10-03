alter table public.products
  add column if not exists name_fr text,
  add column if not exists name_ar text,
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "KBM admin can read product images"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.kbm_is_admin()));

create policy "KBM admin can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.kbm_is_admin()));

create policy "KBM admin can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.kbm_is_admin()))
  with check (bucket_id = 'product-images' and (select public.kbm_is_admin()));

create policy "KBM admin can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.kbm_is_admin()));

drop function public.web_save_product(text, text, text, integer, numeric);

create function public.web_save_product(
  p_sku text,
  p_name text,
  p_name_fr text,
  p_name_ar text,
  p_size text,
  p_pcs_per_carton integer,
  p_sale_price numeric,
  p_image_path text
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
     or p_sale_price < 0
     or (p_image_path is not null and p_image_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[.](jpg|png|webp)$') then
    raise exception 'SKU, pièces par carton, prix ou image doivent être valides';
  end if;

  insert into public.products(
    sku, name, name_fr, name_ar, size, pcs_per_carton, sale_price, image_path
  )
  values (
    upper(btrim(p_sku)), nullif(btrim(p_name), ''),
    nullif(btrim(p_name_fr), ''), nullif(btrim(p_name_ar), ''),
    nullif(btrim(p_size), ''), p_pcs_per_carton, p_sale_price, p_image_path
  )
  on conflict (sku) do update
  set name = coalesce(nullif(btrim(excluded.name), ''), products.name),
      name_fr = coalesce(nullif(btrim(excluded.name_fr), ''), products.name_fr),
      name_ar = coalesce(nullif(btrim(excluded.name_ar), ''), products.name_ar),
      size = coalesce(nullif(btrim(excluded.size), ''), products.size),
      pcs_per_carton = excluded.pcs_per_carton,
      sale_price = excluded.sale_price,
      image_path = coalesce(excluded.image_path, products.image_path);

  return jsonb_build_object('sku', upper(btrim(p_sku)));
end
$function$;

revoke all on function public.web_save_product(text, text, text, text, text, integer, numeric, text)
  from anon, public;
grant execute on function public.web_save_product(text, text, text, text, text, integer, numeric, text)
  to authenticated;
