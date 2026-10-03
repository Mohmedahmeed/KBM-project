import { createClient } from "@/lib/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";

export async function getManagementData() {
  const supabase = await createClient();
  const [
    productsResult,
    movementsResult,
    shipmentsResult,
    shipmentItemsResult,
    shipmentCostsResult,
    customersResult,
    salesResult,
    saleItemsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase.from("products").select("sku,name,name_fr,name_ar,size,pcs_per_carton,sale_price,image_path").order("sku").limit(1000),
    supabase.from("stock_movements").select("mv_date,sku,qty,type,sale_id").limit(5000),
    supabase.from("shipments").select("id,code,ship_date,fx_rmb_tnd,arrived,notes").order("ship_date", { ascending: false }).limit(1000),
    supabase.from("shipment_items").select("shipment_id,sku,cartons,pcs_per_carton,total_pcs,unit_price_rmb").limit(5000),
    supabase.from("shipment_costs").select("id,shipment_id,cost_date,type,label,amount,currency,fx_to_tnd,basis,voided_at").is("voided_at", null).order("cost_date", { ascending: false }).limit(1000),
    supabase.from("customers").select("id,name,phone,notes,created_at").order("name").limit(1000),
    supabase.from("sales").select("id,sale_date,customer_id,total_tnd,note,voided_at").order("sale_date", { ascending: false }).limit(1000),
    supabase.from("sale_items").select("sale_id,sku,qty,unit_price_tnd").limit(5000),
    supabase.from("payments").select("id,pay_date,customer_id,sale_id,amount_tnd,method,note,voided_at").order("pay_date", { ascending: false }).limit(1000),
  ]);

  const failures: { label: string; error: PostgrestError | null }[] = [
    { label: "produits", error: productsResult.error },
    { label: "mouvements de stock", error: movementsResult.error },
    { label: "containers", error: shipmentsResult.error },
    { label: "articles des containers", error: shipmentItemsResult.error },
    { label: "frais des containers", error: shipmentCostsResult.error },
    { label: "clients", error: customersResult.error },
    { label: "ventes", error: salesResult.error },
    { label: "articles vendus", error: saleItemsResult.error },
    { label: "paiements", error: paymentsResult.error },
  ];
  const failure = failures.find((item) => item.error);

  if (failure?.error) {
    throw new Error(`Lecture ${failure.label} impossible : ${failure.error.message}`);
  }

  const products = productsResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const shipments = shipmentsResult.data ?? [];
  const shipmentItems = shipmentItemsResult.data ?? [];
  const shipmentCosts = shipmentCostsResult.data ?? [];
  const customers = customersResult.data ?? [];
  const sales = salesResult.data ?? [];
  const saleItems = saleItemsResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const imagePaths = products.flatMap((product) => product.image_path ? [product.image_path] : []);
  const signedImages = imagePaths.length
    ? await supabase.storage.from("product-images").createSignedUrls(imagePaths, 60 * 60)
    : { data: [], error: null };
  if (signedImages.error) {
    throw new Error(`Lecture des images produits impossible : ${signedImages.error.message}`);
  }
  const imageUrls = new Map(
    (signedImages.data ?? []).flatMap((image) => image.path && image.signedUrl ? [[image.path, image.signedUrl] as const] : []),
  );
  if (imageUrls.size !== imagePaths.length) {
    throw new Error("Une ou plusieurs images produits sont introuvables ou inaccessibles.");
  }
  const stock = new Map<string, number>();

  for (const movement of movements) {
    const qty = Number(movement.qty) || 0;
    const delta = movement.type === "arrivage"
      ? Math.abs(qty)
      : movement.type === "vente" || movement.type === "casse"
        ? -Math.abs(qty)
        : qty;
    stock.set(movement.sku, (stock.get(movement.sku) ?? 0) + delta);
  }

  const cartonsByShipment = new Map<number, number>();
  for (const item of shipmentItems) {
    cartonsByShipment.set(item.shipment_id, (cartonsByShipment.get(item.shipment_id) ?? 0) + Number(item.cartons || 0));
  }

  const unitsByShipment = new Map<number, number>();
  for (const item of shipmentItems) {
    unitsByShipment.set(item.shipment_id, (unitsByShipment.get(item.shipment_id) ?? 0) + Number(item.total_pcs || 0));
  }

  const salesByCustomer = new Map<number, number>();
  for (const sale of sales) {
    if (!sale.voided_at) {
      salesByCustomer.set(sale.customer_id, (salesByCustomer.get(sale.customer_id) ?? 0) + Number(sale.total_tnd || 0));
    }
  }

  const paymentsByCustomer = new Map<number, number>();
  for (const payment of payments) {
    if (!payment.voided_at) {
      paymentsByCustomer.set(payment.customer_id, (paymentsByCustomer.get(payment.customer_id) ?? 0) + Number(payment.amount_tnd || 0));
    }
  }

  const itemsBySale = new Map<number, typeof saleItems>();
  for (const item of saleItems) {
    const items = itemsBySale.get(item.sale_id) ?? [];
    items.push(item);
    itemsBySale.set(item.sale_id, items);
  }

  return {
    products: products.map((product) => ({
      ...product,
      image_url: product.image_path ? imageUrls.get(product.image_path) ?? null : null,
      stock: Math.max(0, stock.get(product.sku) ?? 0),
    })),
    shipments: shipments.map((shipment) => ({
      ...shipment,
      cartons: cartonsByShipment.get(shipment.id) ?? 0,
      units: unitsByShipment.get(shipment.id) ?? 0,
    })),
    shipmentItems,
    shipmentCosts,
    customers: customers.map((customer) => ({
      ...customer,
      sales: salesByCustomer.get(customer.id) ?? 0,
      payments: paymentsByCustomer.get(customer.id) ?? 0,
      balance: (salesByCustomer.get(customer.id) ?? 0) - (paymentsByCustomer.get(customer.id) ?? 0),
    })),
    sales: sales.map((sale) => ({
      ...sale,
      items: itemsBySale.get(sale.id) ?? [],
    })),
    saleItems,
    payments,
    movements,
  };
}
