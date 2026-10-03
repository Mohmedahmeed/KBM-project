"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ManagementActionResult = { success: true; message: string } | { success: false; message: string };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function number(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : Number.NaN;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isSaleItem(value: unknown): value is { sku: string; qty: number; unit_price: number } {
  if (typeof value !== "object" || value === null) return false;
  if (!("sku" in value) || !("qty" in value) || !("unit_price" in value)) return false;
  return typeof value.sku === "string" && value.sku.trim().length > 0 &&
    Number.isInteger(Number(value.qty)) && Number(value.qty) > 0 &&
    Number.isFinite(Number(value.unit_price)) && Number(value.unit_price) >= 0;
}

function isProductTranslation(value: unknown): value is {
  sku: string;
  source: string | null;
  name_fr: string;
  name_ar: string;
} {
  if (typeof value !== "object" || value === null) return false;
  if (!("sku" in value) || !("source" in value) || !("name_fr" in value) || !("name_ar" in value)) return false;
  return typeof value.sku === "string" && value.sku.trim().length > 0 &&
    (typeof value.source === "string" || value.source === null) &&
    typeof value.name_fr === "string" && value.name_fr.trim().length > 0 && value.name_fr.trim().length <= 250 &&
    typeof value.name_ar === "string" && value.name_ar.trim().length > 0 && value.name_ar.trim().length <= 250;
}

async function runAdminRpc(name: string, args: Record<string, unknown>): Promise<ManagementActionResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : "";

  if (claimsError || email !== "derbycafe33@gmail.com") {
    return { success: false, message: "Accès réservé au compte administrateur." };
  }

  const { error } = await supabase.rpc(name, args);
  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/management");
  revalidatePath("/management/translations");
  return { success: true, message: "Opération enregistrée." };
}

export async function saveProduct(formData: FormData): Promise<ManagementActionResult> {
  const sku = text(formData, "sku");
  const pcsPerCarton = number(formData, "pcs_per_carton");
  const priceText = text(formData, "sale_price");
  const price = priceText ? number(formData, "sale_price") : null;
  if (!sku || !Number.isInteger(pcsPerCarton) || pcsPerCarton < 1 ||
      (price !== null && (!Number.isFinite(price) || price < 0))) {
    return { success: false, message: "Vérifiez le SKU, les pièces par carton et le prix." };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : "";
  if (claimsError || email !== "derbycafe33@gmail.com") {
    return { success: false, message: "Accès réservé au compte administrateur." };
  }

  const image = formData.get("image");
  let imagePath: string | null = null;
  let previousImagePath: string | null = null;

  if (image instanceof File && image.size > 0) {
    if (image.size > 5 * 1024 * 1024) {
      return { success: false, message: "L’image ne doit pas dépasser 5 Mo." };
    }

    const bytes = new Uint8Array(await image.slice(0, 12).arrayBuffer());
    const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
      "image/jpeg": (value) => value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff,
      "image/png": (value) => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => value[index] === byte),
      "image/webp": (value) => String.fromCharCode(...value.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...value.slice(8, 12)) === "WEBP",
    };
    const extension = image.type === "image/jpeg" ? "jpg" : image.type === "image/png" ? "png" : "webp";
    if (!signatures[image.type]?.(bytes)) {
      return { success: false, message: "Format d’image invalide. Utilisez JPG, PNG ou WebP." };
    }

    const safeSku = sku.toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
    if (!safeSku) {
      return { success: false, message: "Le SKU ne peut pas servir à identifier l’image." };
    }
    imagePath = `${safeSku}/${crypto.randomUUID()}.${extension}`;
    const { data: currentProduct, error: lookupError } = await supabase
      .from("products").select("image_path").eq("sku", sku.toUpperCase()).maybeSingle();
    if (lookupError) {
      return { success: false, message: `Lecture de l’image existante impossible : ${lookupError.message}` };
    }
    previousImagePath = currentProduct?.image_path ?? null;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(imagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) {
      return { success: false, message: `Envoi de l’image impossible : ${uploadError.message}` };
    }
  }

  const { error } = await supabase.rpc("web_save_product", {
    p_sku: sku,
    p_name: text(formData, "name"),
    p_name_fr: text(formData, "name_fr"),
    p_name_ar: text(formData, "name_ar"),
    p_size: text(formData, "size"),
    p_pcs_per_carton: pcsPerCarton,
    p_sale_price: price,
    p_image_path: imagePath,
  });

  if (error) {
    if (imagePath) {
      const { error: cleanupError } = await supabase.storage.from("product-images").remove([imagePath]);
      const cleanupMessage = cleanupError ? ` L’image temporaire n’a pas pu être supprimée : ${cleanupError.message}` : "";
      return { success: false, message: `${error.message}${cleanupMessage}` };
    }
    return { success: false, message: error.message };
  }

  if (imagePath && previousImagePath) {
    const { error: cleanupError } = await supabase.storage.from("product-images").remove([previousImagePath]);
    if (cleanupError) {
      revalidatePath("/management");
      return { success: true, message: `Produit enregistré, mais l’ancienne image n’a pas pu être supprimée : ${cleanupError.message}` };
    }
  }

  revalidatePath("/");
  revalidatePath("/management");
  return { success: true, message: "Produit enregistré." };
}

export async function saveProductTranslations(formData: FormData): Promise<ManagementActionResult> {
  let translations: unknown;
  try {
    translations = JSON.parse(text(formData, "translations"));
  } catch {
    return { success: false, message: "Les traductions à enregistrer sont invalides." };
  }
  if (!Array.isArray(translations) || translations.length === 0 || translations.length > 300 ||
      !translations.every(isProductTranslation) ||
      new Set(translations.map((item) => item.sku.trim().toUpperCase())).size !== translations.length) {
    return { success: false, message: "Vérifiez les SKU et les noms en français et en arabe." };
  }

  const result = await runAdminRpc("web_save_product_translations", {
    p_translations: translations.map((item) => ({
      sku: item.sku.trim().toUpperCase(),
      source: item.source,
      name_fr: item.name_fr.trim(),
      name_ar: item.name_ar.trim(),
    })),
  });
  return result.success
    ? { ...result, message: `Traductions enregistrées pour ${translations.length} produits.` }
    : result;
}

export async function saveCustomer(formData: FormData): Promise<ManagementActionResult> {
  const name = text(formData, "name");
  if (!name) return { success: false, message: "Le nom du client est obligatoire." };

  return runAdminRpc("web_save_customer", {
    p_name: name,
    p_phone: text(formData, "phone"),
    p_notes: text(formData, "notes"),
  });
}

export async function saveShipment(formData: FormData): Promise<ManagementActionResult> {
  const code = text(formData, "code");
  const date = text(formData, "ship_date");
  const fxText = text(formData, "fx_rmb_tnd");
  const fx = fxText ? number(formData, "fx_rmb_tnd") : null;
  if (!code || !validDate(date) || (fx !== null && (!Number.isFinite(fx) || fx < 0))) {
    return { success: false, message: "Vérifiez le code, la date et le cours RMB → TND." };
  }

  return runAdminRpc("web_save_shipment", {
    p_code: code,
    p_ship_date: date,
    p_fx: fx,
    p_notes: text(formData, "notes"),
  });
}

export async function addShipmentItem(formData: FormData): Promise<ManagementActionResult> {
  const shipmentId = number(formData, "shipment_id");
  const sku = text(formData, "sku");
  const cartons = number(formData, "cartons");
  const pcsPerCarton = number(formData, "pcs_per_carton");
  const unitPrice = number(formData, "unit_price_rmb");
  if (!Number.isInteger(shipmentId) || shipmentId < 1 || !sku ||
      !Number.isInteger(cartons) || cartons < 1 ||
      !Number.isInteger(pcsPerCarton) || pcsPerCarton < 1 ||
      !Number.isFinite(unitPrice) || unitPrice < 0) {
    return { success: false, message: "Vérifiez l’article, les quantités et le prix RMB." };
  }

  return runAdminRpc("web_add_shipment_item", {
    p_shipment_id: shipmentId,
    p_sku: sku,
    p_name: text(formData, "name"),
    p_pcs_per_carton: pcsPerCarton,
    p_cartons: cartons,
    p_unit_price_rmb: unitPrice,
  });
}

export async function receiveShipment(formData: FormData): Promise<ManagementActionResult> {
  const shipmentId = number(formData, "shipment_id");
  if (!Number.isInteger(shipmentId) || shipmentId < 1) {
    return { success: false, message: "Container invalide." };
  }
  return runAdminRpc("web_receive_shipment", { p_shipment_id: shipmentId });
}

export async function setShipmentFx(formData: FormData): Promise<ManagementActionResult> {
  const shipmentId = number(formData, "shipment_id");
  const fx = number(formData, "fx_rmb_tnd");
  if (!Number.isInteger(shipmentId) || shipmentId < 1 || !Number.isFinite(fx) || fx <= 0) {
    return { success: false, message: "Vérifiez le container et le cours RMB → TND." };
  }
  return runAdminRpc("web_set_shipment_fx", {
    p_shipment_id: shipmentId,
    p_fx: fx,
  });
}

export async function createSale(formData: FormData): Promise<ManagementActionResult> {
  const saleDate = text(formData, "sale_date");
  const customerId = number(formData, "customer_id");
  const paid = number(formData, "paid");
  let items: unknown;
  try {
    items = JSON.parse(text(formData, "items"));
  } catch {
    return { success: false, message: "Les articles de la vente sont invalides." };
  }

  if (!validDate(saleDate) || !Number.isInteger(customerId) || customerId < 1 ||
      !Number.isFinite(paid) || paid < 0 || !Array.isArray(items) || items.length === 0 ||
      !items.every(isSaleItem)) {
    return { success: false, message: "Vérifiez le client, la date, les articles et le paiement." };
  }

  return runAdminRpc("web_create_sale", {
    p_sale_date: saleDate,
    p_customer_id: customerId,
    p_items: items.map((item) => ({
      sku: item.sku.trim(),
      qty: Number(item.qty),
      unit_price: Number(item.unit_price),
    })),
    p_paid: paid,
    p_note: text(formData, "note"),
  });
}

export async function createPayment(formData: FormData): Promise<ManagementActionResult> {
  const payDate = text(formData, "pay_date");
  const customerId = number(formData, "customer_id");
  const amount = number(formData, "amount_tnd");
  if (!validDate(payDate) || !Number.isInteger(customerId) || customerId < 1 ||
      !Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: "Vérifiez le client, la date et le montant encaissé." };
  }

  return runAdminRpc("web_create_payment", {
    p_pay_date: payDate,
    p_customer_id: customerId,
    p_amount: amount,
    p_method: text(formData, "method"),
    p_note: text(formData, "note"),
  });
}

export async function addStockMovement(formData: FormData): Promise<ManagementActionResult> {
  const date = text(formData, "mv_date");
  const sku = text(formData, "sku");
  const qty = number(formData, "qty");
  const type = text(formData, "type");
  if (!validDate(date) || !sku || !Number.isInteger(qty) || qty === 0 ||
      !["casse", "ajustement"].includes(type)) {
    return { success: false, message: "Vérifiez le produit, la date et le mouvement." };
  }

  return runAdminRpc("web_add_movement", {
    p_mv_date: date,
    p_sku: sku,
    p_qty: qty,
    p_type: type,
    p_note: text(formData, "note"),
  });
}

export async function addShipmentCost(formData: FormData): Promise<ManagementActionResult> {
  const shipmentId = number(formData, "shipment_id");
  const date = text(formData, "cost_date");
  const amount = number(formData, "amount");
  const fxText = text(formData, "fx_to_tnd");
  const fx = fxText ? number(formData, "fx_to_tnd") : 1;
  const currency = text(formData, "currency");
  const basis = text(formData, "basis");
  if (!Number.isInteger(shipmentId) || shipmentId < 1 || !validDate(date) ||
      !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(fx) || fx <= 0 ||
      !["RMB", "USD", "TND"].includes(currency) || !["value", "cbm", "pcs"].includes(basis)) {
    return { success: false, message: "Vérifiez la date, le montant, la devise et la répartition." };
  }

  return runAdminRpc("web_add_shipment_cost", {
    p_shipment_id: shipmentId,
    p_cost_date: date,
    p_type: text(formData, "type"),
    p_label: text(formData, "label"),
    p_amount: amount,
    p_currency: currency,
    p_fx_to_tnd: fx,
    p_basis: basis,
  });
}
