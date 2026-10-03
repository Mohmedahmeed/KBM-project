import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productTranslationSuggestions } from "@/lib/product-translation-suggestions";
import { ReviewTranslations } from "./review-translations";

export const metadata = { title: "مراجعة ترجمة المنتجات | KBM Stock" };

const normalizeSourceName = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();

export default async function ProductTranslationsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : "";
  if (claimsError || email !== "derbycafe33@gmail.com") redirect("/login");

  const { data: products, error } = await supabase
    .from("products")
    .select("sku,name,name_fr,name_ar")
    .order("sku")
    .limit(1000);
  if (error) throw new Error(`Lecture des produits pour traduction impossible : ${error.message}`);

  const suggestions = new Map(productTranslationSuggestions.map(([source, name_fr, name_ar]) => [
    normalizeSourceName(source),
    { name_fr, name_ar },
  ]));
  const suggestionBySku = new Map([
    ["16943-31", {
      name_fr: "JB-036, porte-couverts et baguettes carré, couleur or",
      name_ar: "JB-036، حامل مربع للملاعق والشوك وأعواد الطعام، لون ذهبي",
    }],
  ]);
  const rows = (products ?? [])
    .filter((product) => !product.name_fr || !product.name_ar)
    .map((product) => {
      const suggestion = (product.name ? suggestions.get(normalizeSourceName(product.name)) : undefined)
        ?? suggestionBySku.get(product.sku);
      return {
        sku: product.sku,
        source: product.name,
        name_fr: product.name_fr || suggestion?.name_fr || "",
        name_ar: product.name_ar || suggestion?.name_ar || "",
        suggestionMissing: !suggestion,
      };
    });

  return <ReviewTranslations rows={rows} />;
}
