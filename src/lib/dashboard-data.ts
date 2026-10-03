import { createClient } from "@/lib/supabase/server";

type Product = {
  sku: string;
  name: string | null;
  sale_price: number | string | null;
};

type Shipment = {
  id: number;
  code: string;
  ship_date: string | null;
  arrived: boolean | null;
};

type StockMovement = {
  sku: string;
  qty: number;
  type: string;
};

type Sale = {
  id: number;
  customer_id: number;
  sale_date: string;
  total_tnd: number | string;
};

type Customer = { id: number; name: string };
type Payment = { sale_id: number | null; amount_tnd: number | string; voided_at: string | null };

const emptySnapshot = {
  inventoryValue: 0,
  monthlySales: 0,
  units: 0,
  productCount: 0,
  activeShipmentCount: 0,
  cartonsInTransit: 0,
  stockDistribution: { healthy: 0, low: 0, out: 0 },
  weeklySales: [] as { day: string; amount: number; height: number }[],
  lowStock: [] as { sku: string; name: string; remaining: number; tone: string }[],
  shipments: [] as { code: string; date: string; cartons: number; status: string }[],
  transactions: [] as { id: number; initials: string; name: string; detail: string; amount: number; status: string }[],
};

export async function getDashboardData() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    return { ...emptySnapshot, error: "Configurez la connexion Supabase dans .env.local." };
  }

  try {
    const supabase = await createClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString().slice(0, 10);

    const [productsResult, shipmentsResult, shipmentItemsResult, movementsResult, monthlySalesResult, weeklySalesResult, recentSalesResult, customersResult, paymentsResult] = await Promise.all([
      supabase.from("products").select("sku,name,sale_price"),
      supabase.from("shipments").select("id,code,ship_date,arrived").order("ship_date", { ascending: false }).limit(20),
      supabase.from("shipment_items").select("shipment_id,cartons"),
      supabase.from("stock_movements").select("sku,qty,type"),
      supabase.from("sales").select("total_tnd,sale_date").is("voided_at", null).gte("sale_date", monthStart).lt("sale_date", nextMonth),
      supabase.from("sales").select("total_tnd,sale_date").is("voided_at", null).gte("sale_date", weekStart),
      supabase.from("sales").select("id,customer_id,sale_date,total_tnd").is("voided_at", null).order("sale_date", { ascending: false }).limit(3),
      supabase.from("customers").select("id,name"),
      supabase.from("payments").select("sale_id,amount_tnd,voided_at").is("voided_at", null),
    ]);

    const failedQuery = [
      ["products", productsResult.error],
      ["shipments", shipmentsResult.error],
      ["shipment_items", shipmentItemsResult.error],
      ["stock_movements", movementsResult.error],
      ["sales", monthlySalesResult.error || weeklySalesResult.error || recentSalesResult.error],
      ["customers", customersResult.error],
      ["payments", paymentsResult.error],
    ].find(([, error]) => error);

    if (failedQuery) {
      return {
        ...emptySnapshot,
        error: `Supabase bloque la lecture de ${failedQuery[0]}. Dans Supabase → SQL Editor, exécutez la migration 20261002000001_admin_read_access.sql, puis actualisez cette page.`,
      };
    }

    const products = (productsResult.data ?? []) as Product[];
    const shipments = (shipmentsResult.data ?? []) as Shipment[];
    const stockMovements = (movementsResult.data ?? []) as StockMovement[];
    const monthlySales = monthlySalesResult.data ?? [];
    const weeklySales = weeklySalesResult.data ?? [];
    const recentSales = (recentSalesResult.data ?? []) as Sale[];
    const customers = (customersResult.data ?? []) as Customer[];
    const payments = (paymentsResult.data ?? []) as Payment[];
    const shipmentItems = shipmentItemsResult.data ?? [];

    const stockBySku = new Map<string, number>();
    for (const movement of stockMovements) {
      const quantity = Number(movement.qty) || 0;
      const delta = movement.type === "arrivage"
        ? Math.abs(quantity)
        : movement.type === "vente" || movement.type === "casse"
          ? -Math.abs(quantity)
          : quantity;
      stockBySku.set(movement.sku, (stockBySku.get(movement.sku) ?? 0) + delta);
    }

    const positiveProducts = products.map((product) => ({
      ...product,
      remaining: Math.max(0, stockBySku.get(product.sku) ?? 0),
    }));
    const stockDistribution = positiveProducts.reduce(
      (counts, product) => {
        if (product.remaining === 0) counts.out += 1;
        else if (product.remaining <= 10) counts.low += 1;
        else counts.healthy += 1;
        return counts;
      },
      { healthy: 0, low: 0, out: 0 },
    );

    const cartonsByShipment = new Map<number, number>();
    for (const item of shipmentItems) {
      cartonsByShipment.set(item.shipment_id, (cartonsByShipment.get(item.shipment_id) ?? 0) + Number(item.cartons || 0));
    }

    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const paidBySale = new Map<number, number>();
    for (const payment of payments) {
      if (payment.sale_id !== null) {
        paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + Number(payment.amount_tnd || 0));
      }
    }

    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
      const dayKey = date.toISOString().slice(0, 10);
      const amount = weeklySales.reduce((sum, sale) => sale.sale_date === dayKey ? sum + Number(sale.total_tnd || 0) : sum, 0);
      return { day: new Intl.DateTimeFormat("fr-TN", { weekday: "short" }).format(date), amount, height: 0 };
    });
    const highestDay = Math.max(1, ...weekDays.map((day) => day.amount));
    weekDays.forEach((day) => { day.height = Math.max(4, Math.round((day.amount / highestDay) * 100)); });

    const activeShipments = shipments.filter((shipment) => shipment.arrived === false);
    const formatShipmentDate = (date: string | null) => date
      ? new Intl.DateTimeFormat("fr-TN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`))
      : "Date non définie";

    return {
      error: null,
      inventoryValue: positiveProducts.reduce((sum, product) => sum + product.remaining * Number(product.sale_price || 0), 0),
      monthlySales: monthlySales.reduce((sum, sale) => sum + Number(sale.total_tnd || 0), 0),
      units: positiveProducts.reduce((sum, product) => sum + product.remaining, 0),
      productCount: products.length,
      activeShipmentCount: activeShipments.length,
      cartonsInTransit: activeShipments.reduce((sum, shipment) => sum + (cartonsByShipment.get(shipment.id) ?? 0), 0),
      stockDistribution,
      weeklySales: weekDays,
      lowStock: positiveProducts
        .filter((product) => product.remaining <= 10)
        .sort((left, right) => left.remaining - right.remaining)
        .slice(0, 3)
        .map((product) => ({
          sku: product.sku,
          name: product.name || product.sku,
          remaining: product.remaining,
          tone: product.remaining <= 5 ? "red" : "amber",
        })),
      shipments: shipments.slice(0, 3).map((shipment) => ({
        code: shipment.code,
        date: formatShipmentDate(shipment.ship_date),
        cartons: cartonsByShipment.get(shipment.id) ?? 0,
        status: shipment.arrived ? "Arrivée" : "En transit",
      })),
      transactions: recentSales.map((sale) => {
        const paid = paidBySale.get(sale.id) ?? 0;
        const amount = Number(sale.total_tnd || 0);
        const name = customerNames.get(sale.customer_id) ?? "Client";
        return {
          id: sale.id,
          initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
          name,
          detail: new Intl.DateTimeFormat("fr-TN", { day: "numeric", month: "short" }).format(new Date(`${sale.sale_date}T12:00:00`)),
          amount,
          status: paid >= amount ? "Réglée" : paid > 0 ? "Partielle" : "À régler",
        };
      }),
    };
  } catch {
    return { ...emptySnapshot, error: "Connexion à Supabase impossible. Vérifiez la configuration et réessayez." };
  }
}