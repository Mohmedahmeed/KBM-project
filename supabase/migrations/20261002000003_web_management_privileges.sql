revoke delete on
  public.products,
  public.shipments,
  public.shipment_items,
  public.shipment_costs,
  public.stock_movements,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments
from authenticated;

revoke all on function public.web_save_product(text,text,text,integer,numeric) from anon, public;
revoke all on function public.web_save_customer(text,text,text) from anon, public;
revoke all on function public.web_save_shipment(text,date,numeric,text) from anon, public;
revoke all on function public.web_set_shipment_fx(integer,numeric) from anon, public;
revoke all on function public.web_add_shipment_item(integer,text,text,integer,integer,numeric) from anon, public;
revoke all on function public.web_receive_shipment(integer) from anon, public;
revoke all on function public.web_create_sale(date,integer,jsonb,numeric,text) from anon, public;
revoke all on function public.web_create_payment(date,integer,numeric,text,text) from anon, public;
revoke all on function public.web_add_movement(date,text,integer,text,text) from anon, public;
revoke all on function public.web_add_shipment_cost(integer,date,text,text,numeric,text,numeric,text) from anon, public;

grant execute on function public.web_save_product(text,text,text,integer,numeric) to authenticated;
grant execute on function public.web_save_customer(text,text,text) to authenticated;
grant execute on function public.web_save_shipment(text,date,numeric,text) to authenticated;
grant execute on function public.web_set_shipment_fx(integer,numeric) to authenticated;
grant execute on function public.web_add_shipment_item(integer,text,text,integer,integer,numeric) to authenticated;
grant execute on function public.web_receive_shipment(integer) to authenticated;
grant execute on function public.web_create_sale(date,integer,jsonb,numeric,text) to authenticated;
grant execute on function public.web_create_payment(date,integer,numeric,text,text) to authenticated;
grant execute on function public.web_add_movement(date,text,integer,text,text) to authenticated;
grant execute on function public.web_add_shipment_cost(integer,date,text,text,numeric,text,numeric,text) to authenticated;
