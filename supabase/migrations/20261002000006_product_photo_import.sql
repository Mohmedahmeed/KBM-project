create or replace function public.web_import_product_images(p_images jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_expected integer;
  v_updated integer;
begin
  if not public.kbm_is_admin() then
    raise exception 'Access denied';
  end if;
  if p_images is null
     or jsonb_typeof(p_images) <> 'array'
     or jsonb_array_length(p_images) = 0
     or jsonb_array_length(p_images) > 300 then
    raise exception 'Le lot d’images est invalide';
  end if;

  select count(*)::integer
  into v_expected
  from jsonb_array_elements(p_images) as rows(item)
  where jsonb_typeof(item) <> 'object'
     or nullif(btrim(item->>'sku'), '') is null
     or item->>'image_path' !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[.](webp|png|jpg)$'
     or split_part(item->>'image_path', '/', 1)
        <> regexp_replace(upper(btrim(item->>'sku')), '[^A-Z0-9_-]', '-', 'g');

  if v_expected > 0 then
    raise exception 'Chaque image doit avoir un SKU et un chemin valide';
  end if;

  select count(*)::integer
  into v_expected
  from jsonb_array_elements(p_images) as rows(item);

  if (select count(distinct upper(btrim(item->>'sku')))
      from jsonb_array_elements(p_images) as rows(item)) <> v_expected then
    raise exception 'Le lot contient des SKU en double';
  end if;

  update public.products as product
  set image_path = item->>'image_path'
  from jsonb_array_elements(p_images) as rows(item)
  where product.sku = upper(btrim(item->>'sku'));

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Certains SKU du classeur ne correspondent plus aux produits enregistrés';
  end if;

  return jsonb_build_object('updated', v_updated);
end
$function$;

revoke all on function public.web_import_product_images(jsonb) from anon, public;
grant execute on function public.web_import_product_images(jsonb) to authenticated;
