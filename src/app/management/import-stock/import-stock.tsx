"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  MAX_PACKING_LIST_SIZE_BYTES,
  parsePackingList,
  type PackedProductImage,
  type PackingListLine,
} from "@/lib/packing-list-images";
import { createClient } from "@/lib/supabase/client";

type ImportLine = PackingListLine & {
  alreadyExists: boolean;
  alreadyHasImage: boolean;
  uploadedPath: string | null;
  salePriceOverrideTnd: string;
};

type PricingLine = {
  sku: string;
  cartons: number;
  total_pieces: number;
  source_amount_rmb: string;
  sale_price_tnd: string | null;
  sale_total_tnd: string | null;
  expense_share_tnd: string | null;
  landed_unit_cost_tnd: string | null;
  markup_percent: string | null;
};

type PricingPreview = {
  lines: PricingLine[];
  line_count: number;
  priced_line_count: number;
  unpriced_line_count: number;
  total_cartons: number;
  total_pieces: number;
  source_total_rmb: string;
  invoice_total_tnd: string | null;
  additional_costs_tnd: string | null;
  landed_total_tnd: string | null;
  cost_factor: string | null;
  priced_sale_total_tnd: string | null;
  cost_ready: boolean;
};

type ImportResult = PricingPreview & {
  shipment_id: number;
  code: string;
  product_count: number;
};

const french = {
  eyebrow: "KBM STOCK / IMPORT STOCK",
  title: "Importer un container",
  subtitle: "Chargez le packing list, vérifiez chaque article et les coûts, puis confirmez la réception. Le classeur est traité dans ce navigateur.",
  back: "Retour aux produits",
  step1: "1. Charger le fichier",
  step1Text: "Choisissez le fichier Excel .xlsx envoyé par le responsable.",
  step2: "2. Vérifier les données",
  step2Text: "Contrôlez les articles, les quantités, les coûts, les photos et les prix de vente.",
  step3: "3. Confirmer la réception",
  step3Text: "La confirmation enregistre le container et ajoute le stock à la date réelle de réception.",
  chooseFile: "Fichier Excel (.xlsx), jusqu’à 100 Mo",
  analyze: "Analyser le fichier",
  analyzing: "Lecture locale du classeur et vérification du catalogue…",
  summary: "Résumé du packing list",
  lines: "Lignes produit",
  newSkus: "Nouveaux SKU",
  existingSkus: "SKU existants préservés",
  cartons: "Cartons",
  pieces: "Pièces à recevoir",
  photos: "Lignes avec photo",
  sourceTotal: "Total facture source (RMB)",
  fx: "Taux confirmé TND pour 1 RMB",
  costs: "Frais et douane supplémentaires (TND)",
  costHelp: "Le coût en TND s’affiche seulement quand le taux RMB/TND et les frais réels sont saisis. Les frais sont répartis selon la valeur RMB de chaque ligne. Aucun coefficient USD n’est appliqué.",
  invoiceTnd: "Valeur facture convertie (TND)",
  landedTotal: "Coût total rendu (TND)",
  factor: "Coefficient de revient",
  saleTotal: "Total de vente saisi (TND)",
  pricedCount: "Articles avec un prix",
  unpricedCount: "Articles sans prix",
  receivedDate: "Date réelle de réception au dépôt",
  shipDate: "Date d’expédition",
  shipmentCode: "Code du container",
  ratePlaceholder: "Saisir le taux confirmé",
  costsPlaceholder: "Saisir les frais réels, ou 0",
  optional: "Facultatif",
  effectivePrice: "Prix conservé si le champ reste vide",
  verify: "Détail des articles et prix",
  sku: "SKU",
  description: "Description",
  quantity: "Pièces",
  sourceUnit: "Prix achat unitaire (RMB)",
  sourceLineTotal: "Total achat (RMB)",
  allocatedCosts: "Frais alloués (TND)",
  unitCost: "Coût rendu / pièce (TND)",
  salePrice: "Prix de vente / pièce (TND)",
  saleTotalLine: "Total de vente ligne (TND)",
  markup: "Majoration sur coût",
  productState: "Catalogue",
  newProduct: "Nouveau",
  existingProduct: "Existant",
  keepPrice: "Vide = garder le prix actuel",
  noPrice: "Aucun prix",
  costUnavailable: "Saisissez le taux RMB/TND confirmé et les frais pour calculer le coût.",
  missingPhotos: "lignes sans photo",
  additionalPhotos: "photos supplémentaires non liées",
  confirm: "Je confirme que ce container est arrivé au dépôt et que les quantités affichées sont à ajouter au stock.",
  import: "Confirmer et enregistrer le stock",
  importingPhotos: "Préparation des photos",
  saving: "Enregistrement du container, des coûts et du stock…",
  success: "Import confirmé par Supabase",
  another: "Préparer un autre import",
  privacy: "Le classeur n’est envoyé ni à Telegram ni à un service IA. Les photos restent dans le bucket privé Supabase.",
  language: "العربية",
  loaded: "lignes validées. Les produits déjà présents ne seront pas écrasés, sauf le prix de vente saisi explicitement.",
  selectFirst: "Sélectionnez d’abord un fichier .xlsx.",
  login: "Connectez-vous avec le compte administrateur.",
  catalogRead: "Lecture du catalogue impossible. Vérifiez votre accès administrateur.",
  duplicateCatalog: "Le catalogue contient des SKU qui ne sont pas uniques par casse.",
  analyzeFirst: "Analysez le classeur avant de lancer l’import.",
  confirmFirst: "Confirmez que le container est bien arrivé au dépôt.",
  datesInvalid: "Vérifiez le code du container et les dates d’expédition et de réception.",
  fxInvalid: "Le taux RMB/TND doit être positif et confirmé, ou rester vide.",
  costsInvalid: "Les frais TND doivent être positifs ou nuls avec au plus trois décimales.",
  rpcMissing: "La fonction d’import n’est pas installée. Appliquez les migrations prévues, puis réessayez.",
  containerExists: "Ce code de container existe déjà. Vérifiez le code avant de réessayer.",
  retryMismatch: "La demande a changé depuis la dernière tentative. Relancez l’analyse du classeur.",
  genericFailure: "L’import n’a pas été confirmé par la base. Vérifiez les données et réessayez avec la même demande.",
  invalidPayload: "Les données de l’import ne respectent pas le format attendu. Revérifiez le code, les dates et le classeur.",
  incompleteReply: "La réponse de la base est incomplète. Réessayez avec cette même demande.",
  cleanupWarning: "Le nettoyage des photos temporaires est incomplet; elles seront renvoyées à la prochaine tentative.",
  receiptRequired: "La date réelle de réception est obligatoire.",
  analysisFailure: "Impossible d’analyser le fichier. Vérifiez le format Excel et les données des produits et quantités.",
} as const;

const arabic: Record<keyof typeof french, string> = {
  eyebrow: "كي بي أم / استيراد المخزون",
  title: "استيراد حاوية",
  subtitle: "حمّل قائمة التعبئة، راجع كل منتج والتكاليف، ثم أكّد الاستلام. تتم معالجة الملف على هذا المتصفح.",
  back: "العودة إلى المنتجات",
  step1: "١. تحميل الملف",
  step1Text: "اختر ملف Excel بصيغة xlsx الذي أرسله المسؤول.",
  step2: "٢. مراجعة البيانات",
  step2Text: "تحقق من المنتجات والكميات والتكاليف والصور وأسعار البيع.",
  step3: "٣. تأكيد الاستلام",
  step3Text: "التأكيد يسجل الحاوية ويضيف المخزون بتاريخ الاستلام الفعلي.",
  chooseFile: "ملف Excel (.xlsx)، حتى ١٠٠ ميغابايت",
  analyze: "تحليل الملف",
  analyzing: "قراءة الملف محليا ومراجعة المنتجات…",
  summary: "ملخص قائمة التعبئة",
  lines: "أسطر المنتجات",
  newSkus: "رموز جديدة",
  existingSkus: "رموز موجودة محفوظة",
  cartons: "كراتين",
  pieces: "قطع للاستلام",
  photos: "أسطر بها صور",
  sourceTotal: "مجموع الفاتورة الأصلية (RMB)",
  fx: "سعر الصرف المؤكد للدينار لكل RMB",
  costs: "مصاريف إضافية وديوانة (TND)",
  costHelp: "يظهر التكلفة بالدينار فقط بعد إدخال سعر الصرف المؤكد والمصاريف الفعلية. توزع المصاريف حسب قيمة كل منتج في فاتورة RMB. لا يطبق أي معامل خاص بالدولار.",
  invoiceTnd: "قيمة الفاتورة بعد التحويل (TND)",
  landedTotal: "التكلفة الجملية عند الوصول (TND)",
  factor: "معامل التكلفة",
  saleTotal: "مجموع أسعار البيع المدخلة (TND)",
  pricedCount: "منتجات بسعر",
  unpricedCount: "منتجات دون سعر",
  receivedDate: "تاريخ الوصول الفعلي للمخزن",
  shipDate: "تاريخ الشحن",
  shipmentCode: "رمز الحاوية",
  ratePlaceholder: "أدخل سعر الصرف المؤكد",
  costsPlaceholder: "أدخل المصاريف الفعلية أو 0",
  optional: "اختياري",
  effectivePrice: "يبقى السعر الحالي إذا تركت الخانة فارغة",
  verify: "تفاصيل المنتجات والأسعار",
  sku: "رمز المنتج",
  description: "الوصف",
  quantity: "القطع",
  sourceUnit: "سعر الشراء للوحدة (RMB)",
  sourceLineTotal: "مجموع الشراء (RMB)",
  allocatedCosts: "المصاريف الموزعة (TND)",
  unitCost: "تكلفة القطعة عند الوصول (TND)",
  salePrice: "سعر البيع للقطعة (TND)",
  saleTotalLine: "مجموع بيع السطر (TND)",
  markup: "الزيادة على التكلفة",
  productState: "حالة المنتج",
  newProduct: "جديد",
  existingProduct: "موجود",
  keepPrice: "اتركه فارغا للمحافظة على السعر الحالي",
  noPrice: "لا يوجد سعر",
  costUnavailable: "أدخل سعر صرف RMB/TND المؤكد والمصاريف لحساب التكلفة.",
  missingPhotos: "أسطر دون صور",
  additionalPhotos: "صور إضافية غير مرتبطة",
  confirm: "أؤكد وصول الحاوية إلى المخزن وإضافة الكميات الظاهرة إلى المخزون.",
  import: "تأكيد وتسجيل المخزون",
  importingPhotos: "تحضير الصور",
  saving: "تسجيل الحاوية والتكاليف والمخزون…",
  success: "تم تأكيد الاستيراد من قاعدة البيانات",
  another: "تحضير عملية استيراد أخرى",
  privacy: "لا يرسل الملف إلى Telegram أو أي خدمة ذكاء اصطناعي. تبقى الصور في مخزن Supabase الخاص.",
  language: "Français",
  loaded: "أسطر تم التحقق منها. لن يتم تغيير المنتجات الموجودة إلا بسعر البيع الذي تدخله.",
  selectFirst: "اختر ملف xlsx أولا.",
  login: "سجل الدخول بحساب المسؤول.",
  catalogRead: "تعذرت قراءة قائمة المنتجات. تحقق من صلاحيات المسؤول.",
  duplicateCatalog: "تحتوي القائمة على رموز منتجات مكررة باختلاف حالة الأحرف.",
  analyzeFirst: "حلل الملف قبل بدء الاستيراد.",
  confirmFirst: "أكد أن الحاوية وصلت فعلا إلى المخزن.",
  datesInvalid: "تحقق من رمز الحاوية وتاريخ الشحن والاستلام.",
  fxInvalid: "يجب أن يكون سعر RMB/TND موجبا ومؤكدا أو يترك فارغا.",
  costsInvalid: "يجب أن تكون المصاريف بالدينار موجبة أو صفرا وبحد أقصى ثلاث خانات عشرية.",
  rpcMissing: "وظيفة الاستيراد غير مثبتة. طبق ترحيلات قاعدة البيانات المطلوبة ثم أعد المحاولة.",
  containerExists: "رمز الحاوية موجود مسبقا. تحقق من الرمز قبل إعادة المحاولة.",
  retryMismatch: "تغيرت البيانات منذ المحاولة السابقة. أعد تحليل الملف.",
  genericFailure: "لم تؤكد قاعدة البيانات الاستيراد. تحقق من البيانات وأعد المحاولة بالطلب نفسه.",
  invalidPayload: "بيانات الاستيراد لا تطابق التنسيق المطلوب. تحقق من الرمز والتواريخ والملف.",
  incompleteReply: "رد قاعدة البيانات غير مكتمل. أعد المحاولة بالطلب نفسه.",
  cleanupWarning: "لم يكتمل تنظيف الصور المؤقتة؛ ستعاد محاولة رفعها في المحاولة القادمة.",
  receiptRequired: "تاريخ الاستلام الفعلي مطلوب.",
  analysisFailure: "تعذر تحليل الملف. تحقق من أن الملف بصيغة Excel صحيحة وأن بيانات المنتجات والكميات مكتملة.",
};

function messageFor(locale: "fr" | "ar", key: keyof typeof french) {
  return locale === "ar" ? arabic[key] : french[key];
}

const decimalSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const tndAmountSchema = z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/);
const fxRateSchema = z.string()
  .regex(/^\d{1,7}(?:\.\d{1,6})?$/)
  .refine((value) => /[1-9]/.test(value) && BigInt(value.split(".")[0]) <= BigInt(1000000));
const previewLineRequestSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/),
  cartons: z.number().int().positive().max(2147483647),
  pcs_per_carton: z.number().int().positive().max(2147483647),
  unit_price_rmb: decimalSchema,
  amount_rmb: decimalSchema,
  sale_price_tnd: tndAmountSchema.nullable(),
}).strict();
const previewRequestSchema = z.object({
  p_fx_rmb_tnd: fxRateSchema.nullable(),
  p_additional_costs_tnd: tndAmountSchema.nullable(),
  p_lines: z.array(previewLineRequestSchema).min(1).max(1000),
}).strict();
const pricingLineResponseSchema = z.object({
  sku: z.string(),
  cartons: z.number(),
  total_pieces: z.number(),
  source_amount_rmb: z.string(),
  sale_price_tnd: z.string().nullable(),
  sale_total_tnd: z.string().nullable(),
  expense_share_tnd: z.string().nullable(),
  landed_unit_cost_tnd: z.string().nullable(),
  markup_percent: z.string().nullable(),
}).strict();
const pricingResponseSchema = z.object({
  lines: z.array(pricingLineResponseSchema),
  line_count: z.number(),
  priced_line_count: z.number(),
  unpriced_line_count: z.number(),
  total_cartons: z.number(),
  total_pieces: z.number(),
  source_total_rmb: z.string(),
  invoice_total_tnd: z.string().nullable(),
  additional_costs_tnd: z.string().nullable(),
  landed_total_tnd: z.string().nullable(),
  cost_factor: z.string().nullable(),
  priced_sale_total_tnd: z.string().nullable(),
  cost_ready: z.boolean(),
});
const importResponseSchema = pricingResponseSchema.extend({
  shipment_id: z.number(),
  code: z.string(),
  product_count: z.number(),
});
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const importRequestSchema = z.object({
  p_request_id: z.string().uuid(),
  p_code: z.string().regex(/^[A-Z0-9][A-Z0-9 _-]{1,20}$/),
  p_ship_date: isoDateSchema,
  p_received_date: isoDateSchema,
  p_fx_rmb_tnd: fxRateSchema.nullable(),
  p_additional_costs_tnd: tndAmountSchema.nullable(),
  p_lines: z.array(z.object({
    sku: z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/),
    source_name: z.string().max(2000),
    cartons: z.number().int().positive().max(2147483647),
    pcs_per_carton: z.number().int().positive().max(2147483647),
    unit_price_rmb: decimalSchema,
    amount_rmb: decimalSchema,
    cbm_total: decimalSchema.nullable(),
    gross_weight_total: decimalSchema.nullable(),
    sale_price_tnd: tndAmountSchema.nullable(),
    image_path: z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/).nullable(),
  }).strict()).min(1).max(1000),
}).strict().refine((request) => request.p_received_date >= request.p_ship_date);

function isImportResult(value: unknown): value is ImportResult {
  return importResponseSchema.safeParse(value).success;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue.";
}

function isBackendError(error: unknown): error is { code?: string; message?: string } {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (candidate.code === undefined || typeof candidate.code === "string")
    && (candidate.message === undefined || typeof candidate.message === "string");
}

function workbookShipmentCode(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const match = stem.match(/\b[A-Za-z0-9][A-Za-z0-9_-]{1,20}\b/);
  return match?.[0].toUpperCase() ?? "";
}

function workbookShipDate(fileName: string) {
  const match = fileName.match(/\b(20\d{2})[.-](\d{1,2})[.-](\d{1,2})\b/);
  if (!match) return "";
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${match[1]}-${month}-${day}`;
}

function optimizeImage(image: PackedProductImage, sku: string) {
  return (async () => {
    const extension = image.mediaName.split(".").pop()?.toLowerCase() ?? "";
    const mime = extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "bmp"
        ? "image/bmp"
        : extension === "webp"
          ? "image/webp"
          : "image/png";
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(image.bytes).buffer], { type: mime }));
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error(`Préparation de l’image impossible pour ${sku}.`);
    }
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error(`Compression impossible pour ${sku}.`)),
        "image/webp",
        quality,
      );
    });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob;
    try {
      blob = await encode(0.84);
      if (blob.size > 4_500_000) blob = await encode(0.68);
      if (blob.size > 4_500_000) {
        canvas.width = Math.max(1, Math.round(canvas.width * 0.7));
        canvas.height = Math.max(1, Math.round(canvas.height * 0.7));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await encode(0.62);
      }
    } finally {
      bitmap.close();
    }
    if (blob.size > 5 * 1024 * 1024) throw new Error(`La photo ${sku} dépasse la limite de stockage après compression.`);
    return { blob, format: "webp" };
  })();
}

function safeBackendError(error: { code?: string; message?: string }, locale: "fr" | "ar") {
  if (error.message === "Access denied") return messageFor(locale, "login");
  if (error.code === "PGRST202") return messageFor(locale, "rpcMissing");
  if (error.message === "Container already exists") return messageFor(locale, "containerExists");
  if (error.message === "The idempotency key was used for a different import") {
    return messageFor(locale, "retryMismatch");
  }
  if (error.code === "23505") return messageFor(locale, "containerExists");
  return messageFor(locale, "genericFailure");
}

function formatCount(value: number, locale: "fr" | "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-TN" : "fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: string | null | undefined, locale: "fr" | "ar", fractionDigits: number) {
  if (value == null) return "—";
  const [whole, fraction = ""] = value.split(".");
  const formatterLocale = locale === "ar" ? "ar-TN" : "fr-TN";
  const formatter = new Intl.NumberFormat(formatterLocale);
  const separators = formatter.formatToParts(1234.5);
  const decimal = separators.find((part) => part.type === "decimal")?.value ?? ",";
  const integer = BigInt(whole).toLocaleString(formatterLocale);
  const normalizedFraction = fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits);
  const localizedFraction = normalizedFraction
    ? Array.from(localizedDigits(normalizedFraction, formatterLocale)).join("")
    : "";
  return `${integer}${localizedFraction ? `${decimal}${localizedFraction}` : ""}`;
}

function localizedDigits(value: string, locale: string) {
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  return Array.from(value, (digit) => digitFormatter.format(Number(digit)));
}

export function ImportStock() {
  const router = useRouter();
  const [locale, setLocale] = useState<"fr" | "ar">("fr");
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [pricing, setPricing] = useState<PricingPreview | null>(null);
  const [additionalPhotos, setAdditionalPhotos] = useState(0);
  const [rowsWithoutPhotos, setRowsWithoutPhotos] = useState(0);
  const [code, setCode] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [fx, setFx] = useState("");
  const [additionalCostsTnd, setAdditionalCostsTnd] = useState("");
  const [confirmedReceived, setConfirmedReceived] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const previewSequence = useRef(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.localStorage.getItem("kbm-language") === "ar") setLocale("ar");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("kbm-language", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const t = (key: keyof typeof french) => messageFor(locale, key);

  function resetImport() {
    setLines([]);
    setPricing(null);
    setAdditionalPhotos(0);
    setRowsWithoutPhotos(0);
    setConfirmedReceived(false);
    setRequestId("");
    setLocked(false);
    setPreviewPending(false);
    setResult(null);
    setMessage("");
    setFailure("");
  }

  function startAnotherImport() {
    resetImport();
    setFile(null);
    setCode("");
    setShipDate("");
    setReceivedDate("");
    setFx("");
    setAdditionalCostsTnd("");
  }

  useEffect(() => {
    if (lines.length === 0) return;
    const sequence = ++previewSequence.current;
    const timer = window.setTimeout(async () => {
      setPreviewPending(true);
      setPricing(null);
      const payload = {
        p_fx_rmb_tnd: fx.trim() || null,
        p_additional_costs_tnd: additionalCostsTnd.trim() || null,
        p_lines: lines.map((line) => ({
          sku: line.sku,
          cartons: line.cartons,
          pcs_per_carton: line.pcsPerCarton,
          unit_price_rmb: line.unitPriceRmb,
          amount_rmb: line.amountRmb,
          sale_price_tnd: line.salePriceOverrideTnd.trim() || null,
        })),
      };
      const parsed = previewRequestSchema.safeParse(payload);
      if (!parsed.success) {
        if (sequence === previewSequence.current) {
          setPreviewPending(false);
          setFailure(messageFor(locale, "costsInvalid"));
        }
        return;
      }

      try {
        const { data, error } = await createClient().rpc(
          "web_preview_received_shipment_pricing",
          parsed.data,
        );
        if (sequence !== previewSequence.current) return;
        if (error) throw error;
        const result = pricingResponseSchema.safeParse(data);
        if (!result.success) throw new Error("preview");
        setPricing(result.data);
        setFailure("");
      } catch (error) {
        if (sequence === previewSequence.current) {
          setFailure(isBackendError(error) && error.message !== "preview"
            ? safeBackendError(error, locale)
            : messageFor(locale, "genericFailure"));
        }
      } finally {
        if (sequence === previewSequence.current) setPreviewPending(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      previewSequence.current += 1;
    };
  }, [lines, fx, additionalCostsTnd, locale]);

  async function analyze() {
    setFailure("");
    setMessage("");
    setLines([]);
    setPricing(null);
    setPreviewPending(false);
    setResult(null);
    if (!file) {
      setFailure(t("selectFirst"));
      return;
    }

    try {
      setProgress(t("analyzing"));
      let parsed: Awaited<ReturnType<typeof parsePackingList>>;
      try {
        parsed = await parsePackingList(file);
      } catch {
        throw new Error(t("analysisFailure"));
      }
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error(t("login"));

      const products: Array<{ sku: string; image_path: string | null }> = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("products")
          .select("sku,image_path")
          .order("sku")
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(t("catalogRead"));
        products.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      const productBySku = new Map<string, { sku: string; image_path: string | null }>();
      for (const product of products) {
        const key = product.sku.toLocaleUpperCase();
        if (productBySku.has(key)) throw new Error(t("duplicateCatalog"));
        productBySku.set(key, product);
      }
      const mapped = parsed.lines.map((line) => {
        const existing = productBySku.get(line.sku);
        return {
          ...line,
          alreadyExists: Boolean(existing),
          alreadyHasImage: Boolean(existing?.image_path),
          uploadedPath: null,
          salePriceOverrideTnd: "",
        };
      });
      setLines(mapped);
      setPricing(null);
      setAdditionalPhotos(parsed.additionalPhotos);
      setRowsWithoutPhotos(parsed.rowsWithoutPhotos);
      setCode(workbookShipmentCode(file.name));
      setShipDate(workbookShipDate(file.name));
      setReceivedDate("");
      setFx("");
      setAdditionalCostsTnd("");
      setConfirmedReceived(false);
      setRequestId(crypto.randomUUID());
      setLocked(false);
      setMessage(`${mapped.length} ${t("loaded")}`);
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : t("genericFailure"));
    } finally {
      setProgress(null);
    }
  }

  async function importShipment() {
    setFailure("");
    setMessage("");
    if (!file || lines.length === 0 || !requestId) {
      setFailure(t("analyzeFirst"));
      return;
    }
    if (!confirmedReceived) {
      setFailure(t("confirmFirst"));
      return;
    }
    if (!code.trim() || !shipDate || !receivedDate || receivedDate < shipDate) {
      setFailure(t("datesInvalid"));
      return;
    }
    if (fx && !fxRateSchema.safeParse(fx).success) {
      setFailure(t("fxInvalid"));
      return;
    }
    if (additionalCostsTnd && !tndAmountSchema.safeParse(additionalCostsTnd).success) {
      setFailure(t("costsInvalid"));
      return;
    }
    if (!pricing || previewPending) {
      setFailure(t("genericFailure"));
      return;
    }

    const supabase = createClient();
    let preparedLines = lines;
    let completed = 0;
    let transactionRejected = false;
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error(t("login"));
      setLocked(true);
      const toUpload = preparedLines.filter((line) => line.image && !line.alreadyHasImage && !line.uploadedPath);
      for (let offset = 0; offset < toUpload.length; offset += 4) {
        const batch = toUpload.slice(offset, offset + 4);
        setProgress(`${t("importingPhotos")} : ${completed}/${toUpload.length}`);
        const outcomes = await Promise.allSettled(batch.map(async (line) => {
          const { blob, format } = await optimizeImage(line.image!, line.sku);
          const safeSku = line.sku.toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 64);
          const path = `${safeSku}/${crypto.randomUUID()}.${format}`;
          const { error } = await supabase.storage.from("product-images").upload(path, blob, {
            contentType: blob.type,
            upsert: false,
          });
          if (error) throw new Error(`Envoi de la photo ${line.sku} impossible.`);
          return { sku: line.sku, path };
        }));
        const uploaded = outcomes.flatMap((outcome) =>
          outcome.status === "fulfilled" ? [outcome.value] : [],
        );
        if (uploaded.length) {
          preparedLines = preparedLines.map((line) => {
            const match = uploaded.find((item) => item.sku === line.sku);
            return match ? { ...line, uploadedPath: match.path } : line;
          });
          setLines(preparedLines);
        }
        completed += batch.length;
        const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
        if (rejected) throw rejected.reason;
      }

      const importLines = preparedLines.map((line) => ({
        sku: line.sku,
        source_name: line.sourceName,
        cartons: line.cartons,
        pcs_per_carton: line.pcsPerCarton,
        unit_price_rmb: line.unitPriceRmb,
        amount_rmb: line.amountRmb,
        cbm_total: line.cbmTotal,
        gross_weight_total: line.grossWeightTotal,
        sale_price_tnd: line.salePriceOverrideTnd.trim() || null,
        image_path: line.uploadedPath,
      }));
      setProgress(t("saving"));
      const request = importRequestSchema.safeParse({
        p_request_id: requestId,
        p_code: code.trim().toUpperCase(),
        p_ship_date: shipDate,
        p_received_date: receivedDate,
        p_fx_rmb_tnd: fx || null,
        p_additional_costs_tnd: additionalCostsTnd || null,
        p_lines: importLines,
      });
      if (!request.success) {
        setLocked(false);
        throw new Error(t("invalidPayload"));
      }
      const { data, error } = await supabase.rpc("web_import_received_shipment", request.data);
      if (error) {
        transactionRejected = error.code === "P0001" || error.code === "PGRST202" ||
          error.code?.startsWith("22") || error.code?.startsWith("23") ||
          error.code?.startsWith("42");
        if (transactionRejected) {
          setLocked(false);
        }
        throw new Error(safeBackendError(error, locale));
      }
      if (!isImportResult(data)) {
        throw new Error(t("incompleteReply"));
      }
      const imported = data;
      setResult(imported);
      setPricing(imported);
      setMessage(`${t("success")} : ${imported.code} · ${formatCount(imported.line_count, locale)} lignes · ${formatCount(imported.total_pieces, locale)} pièces.`);
      router.refresh();
    } catch (error) {
      setLocked(false);
      let cleanupNotice = "";
      if (transactionRejected) {
        const paths = preparedLines.flatMap((line) => line.uploadedPath ? [line.uploadedPath] : []);
        if (paths.length > 0) {
          const { error: cleanupError } = await supabase.storage.from("product-images").remove(paths);
          if (cleanupError) {
            cleanupNotice = ` ${t("cleanupWarning")}`;
          }
          preparedLines = preparedLines.map((line) => ({ ...line, uploadedPath: null }));
          setLines(preparedLines);
        }
      }
      setFailure(`${errorMessage(error)}${cleanupNotice}`);
    } finally {
      setProgress(null);
    }
  }

  const newProducts = lines.filter((line) => !line.alreadyExists).length;
  const existingProducts = lines.length - newProducts;
  const pricingBySku = new Map((pricing?.lines ?? []).map((line) => [line.sku, line]));

  return (
    <main className="photo-import-page shipment-import-page" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <header className="photo-import-header">
        <div>
          <p>{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="shipment-import-header-actions">
          <button type="button" className="shipment-import-language" onClick={() => setLocale(locale === "ar" ? "fr" : "ar")}>{t("language")}</button>
          <Link href="/management/products">{t("back")}</Link>
        </div>
      </header>
      <section className="photo-import-card">
        <ol className="photo-import-steps">
          <li><strong>{t("step1")}</strong><span>{t("step1Text")}</span></li>
          <li><strong>{t("step2")}</strong><span>{t("step2Text")}</span></li>
          <li><strong>{t("step3")}</strong><span>{t("step3Text")}</span></li>
        </ol>
        <label className="photo-import-file">
          <span>{locale === "fr" ? `Fichier Excel (.xlsx), jusqu’à ${MAX_PACKING_LIST_SIZE_BYTES / (1024 * 1024)} Mo` : `ملف Excel (.xlsx)، حتى ${MAX_PACKING_LIST_SIZE_BYTES / (1024 * 1024)} ميغابايت`}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={progress !== null || locked}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              setFile(selectedFile);
              resetImport();
              setCode("");
              setShipDate("");
              setReceivedDate("");
              setFx("");
              setAdditionalCostsTnd("");
            }}
          />
        </label>
        {file && <p className="photo-import-file-info">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo</p>}
        <button type="button" className="photo-import-button secondary" disabled={!file || progress !== null || locked} onClick={analyze}>
          {t("analyze")}
        </button>
        {lines.length > 0 && (
          <section className="photo-import-preview">
            <h2>{t("summary")}</h2>
            {pricing && (
              <div className="shipment-import-summary">
                <span><strong>{formatCount(pricing.line_count, locale)}</strong>{t("lines")}</span>
                <span><strong>{formatCount(newProducts, locale)}</strong>{t("newSkus")}</span>
                <span><strong>{formatCount(existingProducts, locale)}</strong>{t("existingSkus")}</span>
                <span><strong>{formatCount(pricing.total_cartons, locale)}</strong>{t("cartons")}</span>
                <span><strong>{formatCount(pricing.total_pieces, locale)}</strong>{t("pieces")}</span>
                <span><strong>{formatCount(lines.filter((line) => line.image).length, locale)}</strong>{t("photos")}</span>
                <span><strong>{formatDecimal(pricing.source_total_rmb, locale, 3)}</strong>{t("sourceTotal")}</span>
                <span><strong>{formatDecimal(pricing.invoice_total_tnd, locale, 3)}</strong>{t("invoiceTnd")}</span>
                <span><strong>{formatDecimal(pricing.landed_total_tnd, locale, 3)}</strong>{t("landedTotal")}</span>
                <span><strong>{formatDecimal(pricing.cost_factor, locale, 6)}</strong>{t("factor")}</span>
                <span><strong>{formatDecimal(pricing.priced_sale_total_tnd, locale, 3)}</strong>{t("saleTotal")}</span>
                <span><strong>{formatCount(pricing.unpriced_line_count, locale)}</strong>{t("unpricedCount")}</span>
              </div>
            )}
            {(additionalPhotos > 0 || rowsWithoutPhotos > 0) && (
              <p>
                {additionalPhotos > 0 && `${formatCount(additionalPhotos, locale)} ${t("additionalPhotos")}. `}
                {rowsWithoutPhotos > 0 && `${formatCount(rowsWithoutPhotos, locale)} ${t("missingPhotos")}.`}
              </p>
            )}
            <div className="shipment-import-fields">
              <label>{t("shipmentCode")}<input required maxLength={21} value={code} disabled={locked} onChange={(event) => { setCode(event.target.value); setRequestId(crypto.randomUUID()); setResult(null); }} /></label>
              <label>{t("shipDate")}<input required type="date" value={shipDate} disabled={locked} onChange={(event) => { setShipDate(event.target.value); setRequestId(crypto.randomUUID()); setResult(null); }} /></label>
              <label>{t("receivedDate")}<input required type="date" value={receivedDate} disabled={locked} onChange={(event) => { setReceivedDate(event.target.value); setRequestId(crypto.randomUUID()); setResult(null); }} /></label>
              <label>{t("fx")} ({t("optional")})<input inputMode="decimal" placeholder={t("ratePlaceholder")} value={fx} disabled={locked} onChange={(event) => { setFx(event.target.value); setPricing(null); setRequestId(crypto.randomUUID()); setResult(null); }} /></label>
              <label>{t("costs")} ({t("optional")})<input inputMode="decimal" placeholder={t("costsPlaceholder")} value={additionalCostsTnd} disabled={locked} onChange={(event) => { setAdditionalCostsTnd(event.target.value); setPricing(null); setRequestId(crypto.randomUUID()); setResult(null); }} /></label>
            </div>
            <p className="photo-import-warning">{t("costHelp")}</p>
            {previewPending && <p className="photo-import-progress" role="status">{t("analyzing")}</p>}
            {!previewPending && pricing && !pricing.cost_ready && <p className="photo-import-warning">{t("costUnavailable")}</p>}
            <label className="shipment-import-confirm">
              <input type="checkbox" checked={confirmedReceived} onChange={(event) => setConfirmedReceived(event.target.checked)} />
              {t("confirm")}
            </label>
            <details className="shipment-import-details">
              <summary>{t("verify")} ({formatCount(lines.length, locale)})</summary>
              <div className="shipment-import-table-wrap">
                <table>
                  <thead><tr>
                    <th>{t("sku")}</th><th>{t("description")}</th><th>{t("cartons")}</th><th>{t("quantity")}</th>
                    <th>{t("sourceUnit")}</th><th>{t("sourceLineTotal")}</th><th>{t("allocatedCosts")}</th><th>{t("unitCost")}</th>
                    <th>{t("salePrice")}</th><th>{t("saleTotalLine")}</th><th>{t("markup")}</th><th>{t("productState")}</th>
                  </tr></thead>
                  <tbody>{lines.map((line) => {
                    const row = pricingBySku.get(line.sku);
                    return (
                      <tr key={line.sku}>
                        <td dir="ltr">{line.sku}</td><td>{line.sourceName || "—"}</td>
                        <td>{formatCount(line.cartons, locale)}</td><td>{formatCount(line.totalPieces, locale)}</td>
                        <td dir="ltr">{formatDecimal(line.unitPriceRmb, locale, 3)}</td>
                        <td dir="ltr">{formatDecimal(row?.source_amount_rmb, locale, 3)}</td>
                        <td dir="ltr">{formatDecimal(row?.expense_share_tnd, locale, 3)}</td>
                        <td dir="ltr">{formatDecimal(row?.landed_unit_cost_tnd, locale, 3)}</td>
                        <td>
                          <input
                            className="shipment-import-price-input"
                            aria-label={`${t("salePrice")} ${line.sku}`}
                            inputMode="decimal"
                            placeholder={row?.sale_price_tnd ?? t("optional")}
                            value={line.salePriceOverrideTnd}
                            disabled={locked}
                            onChange={(event) => {
                              const salePriceOverrideTnd = event.target.value;
                              setLines((current) => current.map((item) => item.sku === line.sku
                                ? { ...item, salePriceOverrideTnd }
                                : item));
                              setPricing(null);
                              setRequestId(crypto.randomUUID());
                              setResult(null);
                            }}
                          />
                          {!line.salePriceOverrideTnd && row?.sale_price_tnd && (
                            <small className="shipment-import-effective-price">
                              {t("effectivePrice")}: {formatDecimal(row.sale_price_tnd, locale, 3)}
                            </small>
                          )}
                        </td>
                        <td dir="ltr">{formatDecimal(row?.sale_total_tnd, locale, 3)}</td>
                        <td dir="ltr">{row?.markup_percent == null ? "—" : `${formatDecimal(row.markup_percent, locale, 2)}%`}</td>
                        <td>{line.alreadyExists ? t("existingProduct") : t("newProduct")}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </details>
            <button
              type="button"
              className="photo-import-button"
              disabled={progress !== null || !confirmedReceived || !receivedDate || !pricing || previewPending || locked || Boolean(result)}
              onClick={importShipment}
            >
              {t("import")}
            </button>
          </section>
        )}
        {message && <p className="photo-import-message" role="status">{message}</p>}
        {failure && <p className="photo-import-error" role="alert">{failure}</p>}
        {progress && <p className="photo-import-progress" role="status">{progress}</p>}
        {result && <p className="photo-import-message" role="status">{t("success")} : {formatCount(result.product_count, locale)} nouveaux produits, {formatCount(result.total_pieces, locale)} pièces, {formatDecimal(result.priced_sale_total_tnd, locale, 3)} TND.</p>}
        {result && <button type="button" className="photo-import-button secondary" onClick={startAnotherImport}>{t("another")}</button>}
      </section>
      <p className="photo-import-note">{t("privacy")}</p>
    </main>
  );
}
