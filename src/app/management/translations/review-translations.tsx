"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveProductTranslations, type ManagementActionResult } from "../actions";

export type ProductTranslationReviewRow = {
  sku: string;
  source: string | null;
  name_fr: string;
  name_ar: string;
  suggestionMissing: boolean;
};

export function ReviewTranslations({ rows }: { rows: ProductTranslationReviewRow[] }) {
  const [products, setProducts] = useState(rows);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ManagementActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? products.filter((product) => `${product.sku} ${product.name_fr} ${product.name_ar}`.toLocaleLowerCase().includes(normalized))
      : products;
  }, [products, query]);

  function updateProduct(sku: string, field: "name_fr" | "name_ar", value: string) {
    setProducts((current) => current.map((product) => product.sku === sku ? { ...product, [field]: value } : product));
    setResult(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const response = await saveProductTranslations(formData);
      setResult(response);
      if (response.success) setProducts([]);
    });
  }

  return (
    <main className="translation-review-page" dir="rtl" lang="ar">
      <header className="translation-review-header">
        <div>
          <p>KBM STOCK / PRODUCT NAMES</p>
          <h1>مراجعة أسماء المنتجات</h1>
          <p>راجع أو عدّل الاسمين بالفرنسية والعربية قبل الحفظ. النص الأصلي لن يتغير ولن يظهر في الموقع أو الوثائق.</p>
        </div>
        <Link href="/management">العودة إلى الإدارة</Link>
      </header>
      <section className="translation-review-panel">
        <div className="translation-review-toolbar">
          <p>{products.length} منتج ينتظر الترجمة والمراجعة. الترجمات اقتراحات أولية؛ راجع أسماء المنتجات المتخصصة قبل حفظها.</p>
          <input aria-label="البحث عن منتج" placeholder="ابحث برمز المنتج أو الترجمة…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {products.length === 0 && !result && <p className="translation-review-done">كل المنتجات المعروضة مترجمة باللغتين.</p>}
        <form onSubmit={submit}>
          <div className="translation-review-table-scroll">
            <table className="translation-review-table">
              <thead><tr><th>رمز المنتج</th><th>Nom français</th><th>الاسم بالعربية</th></tr></thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.sku}>
                    <td>
                      <strong dir="ltr">{product.sku}</strong>
                      {product.suggestionMissing && <span className="translation-review-missing">No suggestion; enter both names manually.</span>}
                    </td>
                    <td><input required maxLength={250} aria-label={`Nom français ${product.sku}`} value={product.name_fr} onChange={(event) => updateProduct(product.sku, "name_fr", event.target.value)} dir="auto" /></td>
                    <td><input required maxLength={250} aria-label={`الاسم بالعربية ${product.sku}`} value={product.name_ar} onChange={(event) => updateProduct(product.sku, "name_ar", event.target.value)} dir="auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input type="hidden" name="translations" value={JSON.stringify(products)} readOnly />
          {result && <p className={`translation-review-feedback${result.success ? " success" : " failure"}`} role="status">{result.message}</p>}
          <div className="translation-review-actions">
            <Link href="/management">إلغاء والعودة</Link>
            <button type="submit" disabled={pending || products.length === 0}>
              {pending ? "جارٍ الحفظ…" : `حفظ الترجمة بعد المراجعة (${products.length})`}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
