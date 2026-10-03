"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  addShipmentCost,
  addShipmentItem,
  addStockMovement,
  createPayment,
  createSale,
  receiveShipment,
  saveCustomer,
  saveProduct,
  saveShipment,
  setShipmentFx,
  type ManagementActionResult,
} from "./actions";
import type { getManagementData } from "@/lib/management-data";

type Data = Awaited<ReturnType<typeof getManagementData>>;
export type Section = "overview" | "products" | "stock" | "shipments" | "sales" | "customers" | "payments" | "costs";
type Action = (formData: FormData) => Promise<ManagementActionResult>;

const money = (value: number | string | null) => new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 3,
}).format(Number(value ?? 0));

const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "products", label: "Produits" },
  { id: "stock", label: "Mouvements de stock" },
  { id: "shipments", label: "Containers" },
  { id: "sales", label: "Ventes" },
  { id: "customers", label: "Clients" },
  { id: "payments", label: "Paiements" },
  { id: "costs", label: "Frais containers" },
];

const arabicCopy: Record<string, string> = {
  "Vue d’ensemble": "نظرة عامة", "Produits": "المنتجات", "Mouvements de stock": "حركات المخزون",
  "Containers": "الحاويات", "Ventes": "المبيعات", "Clients": "الحرفاء", "Paiements": "الخلاصات",
  "Frais containers": "مصاريف الحاويات", "GESTION COMMERCIALE": "إدارة تجارية",
  "KBM STOCK / GESTION": "كي بي أم / الإدارة", "Bilan annuel": "ملخص السنة",
  "Tableau de bord": "لوحة القيادة", "Données en direct · Accès administrateur sécurisé": "بيانات مباشرة · دخول آمن للمسؤول",
  "Les modifications sont enregistrées dans votre base Supabase et partagées avec le bot Telegram.": "التغييرات محفوظة في قاعدة بياناتك وتظهر أيضا في بوت تيليغرام.",
  "Rechercher dans cette section": "ابحث في هذا القسم", "Rechercher…": "بحث…",
  "Produits référencés": "المنتجات المسجلة", "Unités disponibles": "القطع المتوفرة",
  "Containers en transit": "حاويات في الطريق", "À recevoir des clients": "مبالغ بذمة الحرفاء",
  "références en stock": "منتجات متوفرة في المخزون", "Calculées depuis les mouvements réels": "محسوبة حسب حركات المخزون",
  "containers au total": "حاويات إجمالا", "Soldes clients positifs": "أرصدة مستحقة من الحرفاء",
  "Alertes de stock": "تنبيهات المخزون", "Dernières ventes": "آخر المبيعات",
  "Aucune alerte de stock.": "لا توجد تنبيهات للمخزون.", "Aucune vente enregistrée.": "لا توجد مبيعات مسجلة.",
  "SKU": "رمز المنتج", "Produit": "المنتج", "Stock": "المخزون", "Prix de vente": "سعر البيع",
  "Traduction à compléter": "الترجمة غير مكتملة", "Nom à traduire": "اسم يحتاج إلى ترجمة",
  "Prix à définir": "السعر غير محدد", "À définir": "غير محدد", "Photo": "الصورة",
  "Nom français": "الاسم بالفرنسية", "Taille": "الحجم", "Pièces/carton": "قطعة/كرتونة",
  "Stock (pcs)": "المخزون (قطعة)", "Aucun produit trouvé.": "لم يتم العثور على منتج.",
  "Ajouter ou mettre à jour un produit": "إضافة منتج أو تحديثه", "Enregistrer le produit": "حفظ المنتج",
  "Produit existant à modifier (facultatif)": "اختر منتجا لتعديله (اختياري)", "Nouveau produit": "منتج جديد",
  "Nom en français": "الاسم بالفرنسية", "الاسم بالعربية": "الاسم بالعربية",
  "Pièces par carton": "عدد القطع في الكرتونة", "Taille / variante": "الحجم / الصنف",
  "Prix de vente unitaire (TND)": "سعر البيع للقطعة (دينار)",
  "Photo (JPG, PNG, WebP · 5 Mo max.)": "الصورة (JPG أو PNG أو WebP · حتى 5 ميغابايت)",
  "Photo actuelle": "الصورة الحالية",
  "Traductions produits": "ترجمة أسماء المنتجات", "Importer photos": "استيراد الصور",
  "Assistant commercial": "المساعد التجاري",
  "Le nom d’origine importé est conservé pour le bot. Les documents afficheront le nom français ou arabe, jamais le texte chinois brut.": "سيبقى الاسم الأصلي محفوظا للبوت. ستعرض الوثائق الاسم الفرنسي أو العربي دون النص الصيني.",
  "Stock actuel": "المخزون الحالي", "État": "الحالة", "Rupture": "نفد", "Stock faible": "مخزون منخفض",
  "Disponible": "متوفر", "Enregistrer une casse ou un ajustement": "تسجيل كسر أو تعديل للمخزون",
  "Enregistrer le mouvement": "حفظ حركة المخزون", "Type de mouvement": "نوع الحركة",
  "Casse": "كسر", "Ajustement (+/-)": "تعديل (+/-)", "Quantité (pcs)": "الكمية (قطعة)",
  "Date": "التاريخ", "Note": "ملاحظة", "Container": "الحاوية",
  "Date d’expédition": "تاريخ الشحن", "Cours RMB → TND": "سعر الصرف RMB → TND",
  "Notes": "ملاحظات", "Créer un container": "إنشاء حاوية", "Créer le container": "إنشاء الحاوية",
  "Ajouter un article au container": "إضافة منتج إلى الحاوية", "Nom du produit": "اسم المنتج",
  "Cartons": "الكرتونات", "Prix unitaire (RMB)": "سعر الوحدة (RMB)", "Ajouter l’article": "إضافة المنتج",
  "Mettre à jour le cours RMB → TND": "تحديث سعر الصرف RMB → TND",
  "Cours (TND par RMB)": "سعر الصرف (دينار لكل RMB)", "Réceptions à confirmer": "استلامات تنتظر التأكيد",
  "Articles": "المنتجات", "Total cartons": "مجموع الكرتونات", "Action": "الإجراء",
  "Aucun container en transit.": "لا توجد حاوية في الطريق.", "Marquer reçu": "تأكيد الاستلام",
  "En transit": "في الطريق", "Reçu": "تم الاستلام", "N°": "الرقم", "Client": "الحريف",
  "Total": "المجموع", "Statut": "الحالة", "Documents": "الوثائق", "Aucune vente trouvée.": "لم يتم العثور على مبيعات.",
  "Facture interne": "فاتورة داخلية", "Bon de livraison": "وصل تسليم", "Annulée": "ملغاة",
  "Active": "نشطة", "Enregistrer une vente": "تسجيل عملية بيع", "Enregistrer la vente": "حفظ البيع",
  "Articles vendus": "المنتجات المباعة", "Choisir un produit": "اختر منتجا", "Prix unitaire (TND)": "سعر الوحدة (دينار)",
  "Retirer": "حذف", "+ Ajouter un article": "+ إضافة منتج", "Montant encaissé (TND)": "المبلغ المقبوض (دينار)",
  "Le stock est contrôlé et vente, paiement initial et mouvements sont enregistrés ensemble.": "يتم التثبت من المخزون وحفظ البيع والخلاص الأولي وحركات المخزون معا.",
  "Téléphone": "الهاتف", "Solde": "الرصيد",
  "Document": "الوثيقة", "Relevé de compte": "كشف الحساب", "Ajouter un client": "إضافة حريف",
  "Enregistrer le client": "حفظ الحريف", "Nom du client": "اسم الحريف", "Vente liée": "البيع المرتبط",
  "Montant": "المبلغ", "Méthode": "الطريقة", "Compte client": "حساب الحريف",
  "Annulé": "ملغى", "Enregistré": "مسجل", "Aucun paiement trouvé.": "لم يتم العثور على خلاصات.",
  "Enregistrer un encaissement": "تسجيل مبلغ مقبوض", "Enregistrer le paiement": "حفظ الخلاص",
  "Montant (TND)": "المبلغ (دينار)", "espèces": "نقدا", "virement": "تحويل بنكي",
  "carte": "بطاقة", "autre": "أخرى", "Libellé": "التسمية", "Devise": "العملة",
  "Répartition": "التوزيع", "Aucun frais enregistré.": "لا توجد مصاريف مسجلة.",
  "Ajouter un frais au container": "إضافة مصروف للحاوية", "Enregistrer le frais": "حفظ المصروف",
  "Taux vers TND": "سعر التحويل إلى الدينار", "Répartition du coût": "توزيع الكلفة",
  "Valeur": "القيمة", "CBM": "الحجم CBM", "Pièces": "القطع",
};

function localize(node: ReactNode, enabled = true, dataArray = false): ReactNode {
  if (!enabled) return node;
  if (typeof node === "string") {
    return arabicCopy[node] ?? node.replace(/(\d+) références en stock/g, "$1 منتجات متوفرة في المخزون")
      .replace(/(\d+) containers au total/g, "$1 حاويات إجمالا")
      .replace(/\bpcs\b/g, "قطعة")
      .replace(/À régler/g, "غير مدفوع")
      .replace(/Réglée/g, "مدفوع");
  }
  if (Array.isArray(node)) {
    return dataArray
      ? node.map((child) => localize(child, enabled, true))
      : Children.map(node, (child) => localize(child, enabled));
  }
  if (!isValidElement<{ [key: string]: unknown }>(node)) return node;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (key === "options" && Array.isArray(value)) {
      props[key] = value.map((option) =>
        typeof option === "object" && option !== null && "label" in option && typeof option.label === "string"
          ? { ...option, label: localize(option.label, enabled) }
          : option,
      );
    } else {
      props[key] = ["headers", "rows"].includes(key)
        ? localize(value as ReactNode, enabled, true)
        : ["children", "title", "submitLabel", "label", "empty"].includes(key)
        ? localize(value as ReactNode, enabled)
        : value;
    }
  }
  return cloneElement(node, props);
}

function ActionForm({ title, action, children, submitLabel, prepare }: {
  title: string;
  action: Action;
  children: ReactNode;
  submitLabel: string;
  prepare?: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ManagementActionResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function submit(formData: FormData) {
    prepare?.(formData);
    const response = await action(formData);
    setResult(response);
    if (response.success) {
      formRef.current?.reset();
      setFormKey((key) => key + 1);
    }
  }

  return (
    <section className="management-form-card">
      <h2>{title}</h2>
      <form key={formKey} ref={formRef} action={submit} className="management-form">
        {children}
        {result && <p className={`management-feedback${result.success ? " success" : " failure"}`} role="status">{result.message}</p>}
        <button className="management-submit" type="submit">{submitLabel}</button>
      </form>
    </section>
  );
}

function Field({ label, name, type = "text", required = false, defaultValue, placeholder, step, min, accept, options }: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  step?: string;
  min?: string;
  accept?: string;
  options?: { value: string; label: string }[];
}) {
  return (
    <label className="management-field">
      <span>{label}</span>
      {options
        ? <select name={name} required={required} defaultValue={defaultValue}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
        : <input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} step={step} min={min} accept={accept} />}
    </label>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="management-table-scroll">
      <table className="management-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.length
            ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
            : <tr><td colSpan={headers.length} className="management-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function MovementBadge({ children }: { children: ReactNode }) {
  return <span className="management-badge">{children}</span>;
}

function ProductEditor({ products, locale }: { products: Data["products"]; locale: "fr" | "ar" }) {
  const [sku, setSku] = useState("");
  const product = products.find((item) => item.sku === sku);
  const options = products.map((item) => ({
    value: item.sku,
    label: `${item.sku} · ${locale === "ar"
      ? item.name_ar || item.name_fr || "اسم يحتاج إلى ترجمة"
      : item.name_fr || item.name_ar || "Nom à traduire"}`,
  }));

  const form = (
    <ActionForm
      key={sku || "new-product"}
      title="Ajouter ou mettre à jour un produit"
      action={saveProduct}
      submitLabel="Enregistrer le produit"
    >
      <label className="management-field">
        <span>Produit existant à modifier (facultatif)</span>
        <select value={sku} onChange={(event) => setSku(event.target.value)}>
          <option value="">Nouveau produit</option>
          {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </label>
      <Field label="SKU" name="sku" defaultValue={product?.sku ?? ""} required />
      <Field label="Nom en français" name="name_fr" defaultValue={product?.name_fr ?? ""} />
      <Field label="الاسم بالعربية" name="name_ar" defaultValue={product?.name_ar ?? ""} />
      <Field label="Pièces par carton" name="pcs_per_carton" type="number" min="1" defaultValue={product?.pcs_per_carton ?? ""} required />
      <Field label="Taille / variante" name="size" defaultValue={product?.size ?? ""} />
      <Field label="Prix de vente unitaire (TND)" name="sale_price" type="number" min="0" step="0.001" defaultValue={product?.sale_price ?? ""} />
      <Field label="Photo (JPG, PNG, WebP · 5 Mo max.)" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
      {product?.image_url && <div className="management-product-preview"><Image src={product.image_url} alt="" width={50} height={50} unoptimized />Photo actuelle</div>}
      <p className="management-hint">Le nom d’origine importé est conservé pour le bot. Les documents afficheront le nom français ou arabe, jamais le texte chinois brut.</p>
    </ActionForm>
  );
  return locale === "ar" ? localize(form) : form;
}

export function ManagementWorkspace({ data, today, initialSection = "overview" }: { data: Data; today: string; initialSection?: Section }) {
  const section = initialSection;
  const [search, setSearch] = useState("");
  const [locale, setLocale] = useState<"fr" | "ar">("fr");
  const [localeLoaded, setLocaleLoaded] = useState(false);
  const isArabic = locale === "ar";
  useEffect(() => {
    if (window.localStorage.getItem("kbm-language") === "ar") setLocale("ar");
    setLocaleLoaded(true);
  }, []);
  useEffect(() => {
    if (localeLoaded) window.localStorage.setItem("kbm-language", locale);
  }, [locale, localeLoaded]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
  }, [isArabic, locale]);
  const query = search.trim().toLocaleLowerCase(isArabic ? "ar" : "fr");
  const productOptions = data.products.map((product) => ({
    value: product.sku,
    label: `${product.sku} · ${isArabic
      ? product.name_ar || product.name_fr || "اسم يحتاج إلى ترجمة"
      : product.name_fr || product.name_ar || "Nom à traduire"}`,
  }));
  const customerOptions = data.customers.map((customer) => ({ value: String(customer.id), label: customer.name }));
  const shipmentOptions = data.shipments.map((shipment) => ({ value: String(shipment.id), label: shipment.code }));

  const visibleProducts = data.products.filter((product) =>
    `${product.sku} ${product.name_fr ?? ""} ${product.name_ar ?? ""} ${product.size ?? ""}`.toLocaleLowerCase("fr").includes(query));
  const visibleCustomers = data.customers.filter((customer) =>
    `${customer.name} ${customer.phone ?? ""}`.toLocaleLowerCase("fr").includes(query));
  const visibleShipments = data.shipments.filter((shipment) =>
    `${shipment.code} ${shipment.notes ?? ""}`.toLocaleLowerCase("fr").includes(query));
  const visibleSales = data.sales.filter((sale) => {
    const customer = data.customers.find((item) => item.id === sale.customer_id)?.name ?? "";
    return `${sale.id} ${customer} ${sale.note ?? ""}`.toLocaleLowerCase("fr").includes(query);
  });
  const visiblePayments = data.payments.filter((payment) => {
    const customer = data.customers.find((item) => item.id === payment.customer_id)?.name ?? "";
    return `${customer} ${payment.method ?? ""} ${payment.note ?? ""} ${payment.id}`.toLocaleLowerCase("fr").includes(query);
  });
  const visibleCosts = data.shipmentCosts.filter((cost) => {
    const code = data.shipments.find((shipment) => shipment.id === cost.shipment_id)?.code ?? "";
    return `${code} ${cost.type} ${cost.label ?? ""}`.toLocaleLowerCase("fr").includes(query);
  });
  const activeProducts = data.products.filter((product) => product.stock > 0).length;
  const totalUnits = data.products.reduce((sum, product) => sum + product.stock, 0);
  const activeShipments = data.shipments.filter((shipment) => !shipment.arrived).length;
  const unpaid = data.customers.reduce((sum, customer) => sum + Math.max(0, customer.balance), 0);

  function renderSection() {
    switch (section) {
      case "overview":
        return (
          <>
            <div className="management-metrics">
              <article><span>Produits référencés</span><strong>{data.products.length}</strong><small>{activeProducts} références en stock</small></article>
              <article><span>Unités disponibles</span><strong>{totalUnits.toLocaleString("fr-TN")}</strong><small>Calculées depuis les mouvements réels</small></article>
              <article><span>Containers en transit</span><strong>{activeShipments}</strong><small>{data.shipments.length} containers au total</small></article>
              <article><span>À recevoir des clients</span><strong>{money(unpaid)}</strong><small>Soldes clients positifs</small></article>
            </div>
            <div className="management-panels">
              <section className="management-panel"><h2>Alertes de stock</h2>
                <DataTable headers={["SKU", "Produit", "Stock", "Prix de vente"]} empty="Aucune alerte de stock." rows={data.products.filter((product) => product.stock <= 10).slice(0, 8).map((product) => [
                  <strong key="sku">{product.sku}</strong>, product.name_fr || product.name_ar || "Traduction à compléter",
                  <MovementBadge key="stock">{product.stock} pcs</MovementBadge>,
                  product.sale_price == null ? "Prix à définir" : money(product.sale_price),
                ])} />
              </section>
              <section className="management-panel"><h2>Dernières ventes</h2>
                <DataTable headers={["Date", "Client", "Montant", "État"]} empty="Aucune vente enregistrée." rows={data.sales.filter((sale) => !sale.voided_at).slice(0, 8).map((sale) => [
                  sale.sale_date,
                  data.customers.find((customer) => customer.id === sale.customer_id)?.name ?? "Client",
                  money(sale.total_tnd),
                  data.payments.filter((payment) => payment.sale_id === sale.id && !payment.voided_at).reduce((sum, payment) => sum + Number(payment.amount_tnd), 0) >= Number(sale.total_tnd) ? "Réglée" : "À régler",
                ])} />
              </section>
            </div>
          </>
        );
      case "products":
        return (
          <>
            <DataTable headers={["Photo", "SKU", "Nom français", "الاسم بالعربية", "Taille", "Pièces/carton", "Stock (pcs)", "Prix de vente"]} empty="Aucun produit trouvé." rows={visibleProducts.map((product) => [
              product.image_url ? <Image key="image" src={product.image_url} alt="" width={42} height={42} unoptimized className="management-product-thumbnail" /> : "—",
              <strong key="sku">{product.sku}</strong>,
              product.name_fr || <span className="management-translation-missing">Traduction à compléter</span>,
              product.name_ar ? <span dir="auto">{product.name_ar}</span> : <span className="management-translation-missing">Traduction à compléter</span>,
              product.size ?? "—",
              product.pcs_per_carton ?? "—", product.stock,
              product.sale_price == null ? "À définir" : money(product.sale_price),
            ])} />
            <ProductEditor products={data.products} locale={locale} />
          </>
        );
      case "stock":
        return (
          <>
            <DataTable headers={["SKU", "Produit", "Stock actuel", "État"]} empty="Aucun produit trouvé." rows={visibleProducts.map((product) => [
              <strong key="sku">{product.sku}</strong>, product.name_fr || product.name_ar || "Traduction à compléter", `${product.stock} pcs`,
              product.stock === 0 ? "Rupture" : product.stock <= 10 ? "Stock faible" : "Disponible",
            ])} />
            <ActionForm title="Enregistrer une casse ou un ajustement" action={addStockMovement} submitLabel="Enregistrer le mouvement">
              <Field label="Produit" name="sku" options={productOptions} required />
              <Field label="Type de mouvement" name="type" options={[{ value: "casse", label: "Casse" }, { value: "ajustement", label: "Ajustement (+/-)" }]} required />
              <Field label="Quantité (pcs)" name="qty" type="number" step="1" required />
              <Field label="Date" name="mv_date" type="date" defaultValue={today} required />
              <Field label="Note" name="note" />
            </ActionForm>
          </>
        );
      case "shipments":
        return (
          <>
            <DataTable headers={["Container", "Date", "Statut", "Cartons", "Pièces", "Cours RMB → TND"]} empty="Aucun container trouvé." rows={visibleShipments.map((shipment) => [
              <strong key="code">{shipment.code}</strong>, shipment.ship_date ?? "—",
              shipment.arrived ? "Reçu" : "En transit", shipment.cartons, shipment.units,
              shipment.fx_rmb_tnd == null ? "À définir" : Number(shipment.fx_rmb_tnd).toFixed(4),
            ])} />
            <div className="management-panels">
              <ActionForm title="Créer un container" action={saveShipment} submitLabel="Créer le container">
                <Field label="Code" name="code" placeholder="KBM-4" required />
                <Field label="Date d’expédition" name="ship_date" type="date" defaultValue={today} required />
                <Field label="Cours RMB → TND" name="fx_rmb_tnd" type="number" min="0" step="0.0001" />
                <Field label="Notes" name="notes" />
              </ActionForm>
              <ActionForm title="Ajouter un article au container" action={addShipmentItem} submitLabel="Ajouter l’article">
                <Field label="Container" name="shipment_id" options={shipmentOptions} required />
                <Field label="SKU" name="sku" required />
                <Field label="Nom du produit" name="name" />
                <Field label="Cartons" name="cartons" type="number" min="1" required />
                <Field label="Pièces par carton" name="pcs_per_carton" type="number" min="1" required />
                <Field label="Prix unitaire (RMB)" name="unit_price_rmb" type="number" min="0" step="0.001" required />
              </ActionForm>
              <ActionForm title="Mettre à jour le cours RMB → TND" action={setShipmentFx} submitLabel="Enregistrer le cours">
                <Field label="Container" name="shipment_id" options={shipmentOptions} required />
                <Field label="Cours (TND par RMB)" name="fx_rmb_tnd" type="number" min="0.0001" step="0.0001" required />
              </ActionForm>
            </div>
            <section className="management-panel"><h2>Réceptions à confirmer</h2>
              <DataTable headers={["Container", "Articles", "Total cartons", "Action"]} empty="Aucun container en transit." rows={data.shipments.filter((shipment) => !shipment.arrived).map((shipment) => [
                <strong key="code">{shipment.code}</strong>,
                data.shipmentItems.filter((item) => item.shipment_id === shipment.id).length,
                shipment.cartons,
                <ReceiveAction shipmentId={shipment.id} key="receive" locale={locale} />,
              ])} />
            </section>
          </>
        );
      case "sales":
        return (
          <>
            <DataTable headers={["N°", "Date", "Client", "Articles", "Total", "Statut", "Documents"]} empty="Aucune vente trouvée." rows={visibleSales.map((sale) => [
              `#${sale.id}`, sale.sale_date,
              data.customers.find((customer) => customer.id === sale.customer_id)?.name ?? "Client",
              sale.items.map((item) => `${item.sku} × ${item.qty}`).join(", ") || "—",
              money(sale.total_tnd),
              sale.voided_at ? "Annulée" : "Active",
              <span className="management-document-links" key={`docs-${sale.id}`}>
                <Link href={`/management/documents?kind=invoice&sale=${sale.id}`} target="_blank">Facture interne</Link>
                <Link href={`/management/documents?kind=delivery&sale=${sale.id}`} target="_blank">Bon de livraison</Link>
              </span>,
            ])} />
            <ActionForm title="Enregistrer une vente" action={createSale} submitLabel="Enregistrer la vente">
              <Field label="Client" name="customer_id" options={customerOptions} required />
              <Field label="Date" name="sale_date" type="date" defaultValue={today} required />
              <SaleItemsEditor products={data.products} locale={locale} />
              <Field label="Montant encaissé (TND)" name="paid" type="number" min="0" step="0.001" defaultValue="0" required />
              <Field label="Note" name="note" />
              <p className="management-hint">Le stock est contrôlé et vente, paiement initial et mouvements sont enregistrés ensemble.</p>
            </ActionForm>
          </>
        );
      case "customers":
        return (
          <>
            <DataTable headers={["Client", "Téléphone", "Ventes", "Paiements", "Solde", "Document"]} empty="Aucun client trouvé." rows={visibleCustomers.map((customer) => [
              <Link className="management-customer-link" href={`/management/customers/${customer.id}`} key={`customer-${customer.id}`}>{customer.name}</Link>, customer.phone ?? "—",
              money(customer.sales), money(customer.payments), money(customer.balance),
              <Link className="management-document-link" href={`/management/documents?kind=statement&customer=${customer.id}`} target="_blank" key={`statement-${customer.id}`}>Relevé de compte</Link>,
            ])} />
            <ActionForm title="Ajouter un client" action={saveCustomer} submitLabel="Enregistrer le client">
              <Field label="Nom du client" name="name" required />
              <Field label="Téléphone" name="phone" type="tel" />
              <Field label="Notes" name="notes" />
            </ActionForm>
          </>
        );
      case "payments":
        return (
          <>
            <DataTable headers={["N°", "Date", "Client", "Vente liée", "Montant", "Méthode", "Statut"]} empty="Aucun paiement trouvé." rows={visiblePayments.map((payment) => [
              `#${payment.id}`, payment.pay_date,
              data.customers.find((customer) => customer.id === payment.customer_id)?.name ?? "Client",
              payment.sale_id ? `#${payment.sale_id}` : "Compte client",
              money(payment.amount_tnd), payment.method ?? "—", payment.voided_at ? "Annulé" : "Enregistré",
            ])} />
            <ActionForm title="Enregistrer un encaissement" action={createPayment} submitLabel="Enregistrer le paiement">
              <Field label="Client" name="customer_id" options={customerOptions} required />
              <Field label="Date" name="pay_date" type="date" defaultValue={today} required />
              <Field label="Montant (TND)" name="amount_tnd" type="number" min="0.001" step="0.001" required />
              <Field label="Méthode" name="method" options={[{ value: "espèces", label: "Espèces" }, { value: "virement", label: "Virement" }, { value: "carte", label: "Carte" }, { value: "autre", label: "Autre" }]} />
              <Field label="Note" name="note" />
            </ActionForm>
          </>
        );
      case "costs":
        return (
          <>
            <DataTable headers={["N°", "Container", "Date", "Type", "Libellé", "Montant", "Devise", "Répartition"]} empty="Aucun frais enregistré." rows={visibleCosts.map((cost) => [
              `#${cost.id}`, data.shipments.find((shipment) => shipment.id === cost.shipment_id)?.code ?? "—",
              cost.cost_date, cost.type, cost.label ?? "—", Number(cost.amount).toLocaleString("fr-TN"),
              cost.currency, cost.basis,
            ])} />
            <ActionForm title="Ajouter un frais au container" action={addShipmentCost} submitLabel="Enregistrer le frais">
              <Field label="Container" name="shipment_id" options={shipmentOptions} required />
              <Field label="Date" name="cost_date" type="date" defaultValue={today} required />
              <Field label="Type" name="type" options={["diwena", "transport_tn", "5adema", "commission", "fret", "stockage", "autre"].map((value) => ({ value, label: value }))} required />
              <Field label="Libellé" name="label" />
              <Field label="Montant" name="amount" type="number" min="0.001" step="0.001" required />
              <Field label="Devise" name="currency" options={["TND", "RMB", "USD"].map((value) => ({ value, label: value }))} required />
              <Field label="Taux vers TND" name="fx_to_tnd" type="number" min="0.0001" step="0.0001" defaultValue="1" required />
              <Field label="Répartition du coût" name="basis" options={[{ value: "value", label: "Valeur" }, { value: "cbm", label: "CBM" }, { value: "pcs", label: "Pièces" }]} required />
            </ActionForm>
          </>
        );
      default:
        return null;
    }
  }

  function SaleItemsEditor({ products, locale }: { products: Data["products"]; locale: "fr" | "ar" }) {
    const [rows, setRows] = useState([{ sku: "", qty: "", unit_price: "" }]);
    const serialized = JSON.stringify(rows
      .filter((row) => row.sku && row.qty && row.unit_price)
      .map((row) => ({ sku: row.sku, qty: Number(row.qty), unit_price: Number(row.unit_price) })));

    function updateRow(index: number, key: "sku" | "qty" | "unit_price", value: string) {
      setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    }

    return (
      <fieldset className="management-sale-items">
        <legend>{locale === "ar" ? "المنتجات المباعة" : "Articles vendus"}</legend>
        {rows.map((row, index) => (
          <div className="management-sale-item" key={index}>
            <label className="management-field">
              <span>{locale === "ar" ? "المنتج" : "Produit"}</span>
              <select required name={`sale_sku_${index}`} value={row.sku} onChange={(event) => updateRow(index, "sku", event.target.value)}>
                <option value="">{locale === "ar" ? "اختر منتجا" : "Choisir un produit"}</option>
                {products.map((product) => <option key={product.sku} value={product.sku}>{product.sku} · {locale === "ar"
                  ? product.name_ar || product.name_fr || "اسم يحتاج إلى ترجمة"
                  : product.name_fr || product.name_ar || "Nom à traduire"} — {product.stock} pcs</option>)}
              </select>
            </label>
            <label className="management-field">
              <span>{locale === "ar" ? "الكمية (قطعة)" : "Quantité (pcs)"}</span>
              <input required type="number" min="1" step="1" value={row.qty} onChange={(event) => updateRow(index, "qty", event.target.value)} />
            </label>
            <label className="management-field">
              <span>{locale === "ar" ? "سعر الوحدة (دينار)" : "Prix unitaire (TND)"}</span>
              <input required type="number" min="0" step="0.001" value={row.unit_price} onChange={(event) => updateRow(index, "unit_price", event.target.value)} />
            </label>
            {rows.length > 1 && <button className="management-remove-item" type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={locale === "ar" ? `حذف المنتج ${index + 1}` : `Supprimer l’article ${index + 1}`}>{locale === "ar" ? "حذف" : "Retirer"}</button>}
          </div>
        ))}
        <input type="hidden" name="items" value={serialized} readOnly />
        <button className="management-add-item" type="button" onClick={() => setRows((current) => [...current, { sku: "", qty: "", unit_price: "" }])}>{locale === "ar" ? "+ إضافة منتج" : "+ Ajouter un article"}</button>
      </fieldset>
    );
  }

  function ReceiveAction({ shipmentId, locale }: { shipmentId: number; locale: "fr" | "ar" }) {
    const [message, setMessage] = useState("");
    return (
      <form action={async (formData: FormData) => {
        const result = await receiveShipment(formData);
        setMessage(result.message);
      }}>
        <input type="hidden" name="shipment_id" value={shipmentId} />
        <button className="management-small-button" type="submit">{locale === "ar" ? "تأكيد الاستلام" : "Marquer reçu"}</button>
        {message && <span className="management-inline-feedback" role="status">{message}</span>}
      </form>
    );
  }

  return localize(
    <main className="management-shell" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <aside className="management-sidebar">
        <Link className="management-brand" href="/">KBM <span>STOCK</span></Link>
        <p className="management-side-label">GESTION COMMERCIALE</p>
        <nav aria-label="Sections de gestion">
          {sections.map((item) => (
            <Link className={section === item.id ? "selected" : ""} aria-current={section === item.id ? "page" : undefined} href={item.id === "overview" ? "/management" : `/management/${item.id}`} key={item.id}>
              {item.label}
              {item.id === "shipments" && activeShipments > 0 && <span>{activeShipments}</span>}
            </Link>
          ))}
        </nav>
        <Link className="management-back" href="/">← Retour au tableau de bord</Link>
      </aside>
      <section className="management-main">
        <header className="management-topbar">
          <div><p>KBM STOCK / GESTION</p><h1>{sections.find((item) => item.id === section)?.label}</h1></div>
          <div className="management-header-links">
            <Link href="/management/translations">Traductions produits ({data.products.filter((product) => !product.name_fr || !product.name_ar).length})</Link>
            <Link href="/management/import-photos">Importer photos</Link>
            <Link href="/management/assistant">Assistant commercial</Link>
            <Link href={`/management/documents?kind=annual&year=${today.slice(0, 4)}`} target="_blank">Bilan annuel</Link>
            <Link href="/">Tableau de bord</Link>
            <button className="management-language-toggle" type="button" aria-label={isArabic ? "Switch to French" : "التبديل إلى العربية"} onClick={() => setLocale(isArabic ? "fr" : "ar")}>{isArabic ? "Français" : "العربية"}</button>
          </div>
        </header>
        <div className="management-content">
          <div className="management-toolbar">
            <p>Les modifications sont enregistrées dans votre base Supabase et partagées avec le bot Telegram.</p>
            {section !== "overview" && <input aria-label={isArabic ? "ابحث في هذا القسم" : "Rechercher dans cette section"} placeholder={isArabic ? "بحث…" : "Rechercher…"} value={search} onChange={(event) => setSearch(event.target.value)} />}
          </div>
          {renderSection()}
          <footer className="management-footer">Données en direct · Accès administrateur sécurisé</footer>
        </div>
      </section>
    </main>,
    isArabic,
  );
}
