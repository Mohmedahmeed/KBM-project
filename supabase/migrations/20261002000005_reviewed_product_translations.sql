create or replace function public.web_save_product_translations(p_translations jsonb)
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
  if p_translations is null
     or jsonb_typeof(p_translations) <> 'array'
     or jsonb_array_length(p_translations) = 0
     or jsonb_array_length(p_translations) > 300 then
    raise exception 'Le lot de traductions est invalide';
  end if;

  select count(*)::integer
  into v_expected
  from jsonb_array_elements(p_translations) as rows(item)
  where jsonb_typeof(item) <> 'object'
     or nullif(btrim(item->>'sku'), '') is null
     or nullif(btrim(item->>'name_fr'), '') is null
     or nullif(btrim(item->>'name_ar'), '') is null
     or length(item->>'name_fr') > 250
     or length(item->>'name_ar') > 250;

  if v_expected > 0 then
    raise exception 'Chaque produit doit avoir un SKU et deux noms traduits valides';
  end if;

  select count(*)::integer
  into v_expected
  from jsonb_array_elements(p_translations) as rows(item);

  if (select count(distinct item->>'sku') from jsonb_array_elements(p_translations) as rows(item)) <> v_expected then
    raise exception 'Le lot contient des SKU en double';
  end if;

  update public.products as product
  set name_fr = btrim(item->>'name_fr'),
      name_ar = btrim(item->>'name_ar')
  from jsonb_array_elements(p_translations) as rows(item)
  where product.sku = item->>'sku'
    and product.name is not distinct from item->>'source';

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Les produits ont changé depuis la préparation des traductions; aucun changement n’a été enregistré';
  end if;

  return jsonb_build_object('updated', v_updated);
end
$function$;

revoke all on function public.web_save_product_translations(jsonb) from anon, public;
grant execute on function public.web_save_product_translations(jsonb) to authenticated;
