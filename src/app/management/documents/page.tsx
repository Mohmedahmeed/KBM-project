import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getManagementData } from "@/lib/management-data";
import { formatTndMills, parseTndMills } from "@/lib/tnd-money";
import { PrintButton } from "./print-button";

type DocumentKind = "invoice" | "delivery" | "statement" | "annual";
type SearchParams = Promise<{ kind?: string; sale?: string; customer?: string; year?: string }>;

const currency = (value: number | string | null) => new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 3,
}).format(Number(value ?? 0));

function DocumentHeading({ title, number }: { title: string; number?: string }) {
  return (
    <header className="print-document-heading">
      <div>
        <p className="print-document-brand">KBM <span>GESTION COMMERCIALE</span></p>
        <h1>{title}</h1>
        <p dir="rtl" lang="ar">{title === "Facture de vente interne"
          ? "فاتورة بيع داخلية"
          : title === "Bon de livraison"
            ? "وصل تسليم"
            : title === "Relevé de compte client"
              ? "كشف حساب الحريف"
              : "ملخص النشاط السنوي"}</p>
      </div>
      {number && <strong>{number}</strong>}
    </header>
  );
}

function PrintTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="print-document-table">
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>
        {rows.length
          ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
          : <tr><td colSpan={headers.length}>Aucune opération sur la période.</td></tr>}
      </tbody>
    </table>
  );
}

export const metadata = { title: "Documents commerciaux | KBM Stock" };

export default async function ManagementDocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : "";
  if (error || email !== "derbycafe33@gmail.com") redirect("/login");

  const params = await searchParams;
  const kind = params.kind as DocumentKind;
  if (!["invoice", "delivery", "statement", "annual"].includes(kind)) notFound();
  const data = await getManagementData();
  const issuer = {
    name: "STE DISTIBUTION DE MARCHANDISES STARS",
    address: "SKALBA, Menzel Temime 8080",
    phone: "52 870 454",
    email: "stemarchandisesstars@gmail.com",
  };

  if (kind === "invoice" || kind === "delivery") {
    const saleId = Number(params.sale);
    if (!Number.isSafeInteger(saleId) || saleId < 1) notFound();
    const sale = data.sales.find((item) => item.id === saleId);
    if (!sale) notFound();
    const customer = data.customers.find((item) => item.id === sale.customer_id);
    if (!customer) notFound();
    const isInvoice = kind === "invoice";
    const salePayments = data.payments.filter((payment) => payment.sale_id === sale.id && !payment.voided_at);
    const paidMills = salePayments.reduce((sum, payment) => sum + (parseTndMills(payment.amount_tnd) ?? BigInt(0)), BigInt(0));
    const pricesMissing = sale.items.some((item) => item.unit_price_tnd == null);
    const lineTotals = sale.items.reduce((sum, item) => {
      const unitPrice = parseTndMills(item.unit_price_tnd);
      return unitPrice === null ? null : (sum ?? BigInt(0)) + BigInt(item.qty) * unitPrice;
    }, BigInt(0) as bigint | null);
    const subtotalMills = parseTndMills(sale.subtotal_tnd);
    const discountMills = parseTndMills(sale.discount_tnd);
    const totalMills = parseTndMills(sale.total_tnd);
    const invoiceNeedsReview = pricesMissing || lineTotals === null || subtotalMills === null ||
      discountMills === null || totalMills === null || lineTotals !== subtotalMills ||
      subtotalMills - discountMills !== totalMills ||
      salePayments.some((payment) => parseTndMills(payment.amount_tnd) === null);
    const currencyFromMills = (value: bigint) => formatTndMills(value, "fr");
    const saleCurrency = (value: number | string | null) => {
      const mills = parseTndMills(value);
      return mills === null ? "À vérifier" : currencyFromMills(mills);
    };

    return (
      <main className={`print-document${isInvoice ? " print-invoice" : ""}`}>
        <div className="print-document-actions no-print">
          <Link href="/management">Retour à la gestion / العودة إلى الإدارة</Link>
          <PrintButton />
        </div>
        {isInvoice ? (
          <header className="invoice-header">
            <div className="invoice-issuer">
              <h1>{issuer.name}</h1>
              <p>{issuer.address}</p>
              <p>Tél. {issuer.phone} <span aria-hidden="true">·</span> {issuer.email}</p>
              <Image className="invoice-logo" src="/stars-distribution-logo.png" alt="Logo Stars Distribution" width={536} height={289} priority />
            </div>
            <div className="invoice-reference">
              <span>FACTURE DE VENTE</span>
              <small dir="rtl" lang="ar">فاتورة بيع داخلية</small>
              <strong>{sale.invoice_number}</strong>
              <p><span>Date / التاريخ</span><b>{sale.sale_date}</b></p>
            </div>
          </header>
        ) : (
          <DocumentHeading title="Bon de livraison" number={`Vente #${sale.id}`} />
        )}
        {sale.voided_at && <p className="print-document-cancelled">VENTE ANNULÉE / عملية بيع ملغاة</p>}
        {isInvoice && invoiceNeedsReview && <p className="print-document-review-warning">Détail ou total incohérent : vérifier avant utilisation / يوجد اختلاف في التفاصيل أو المجموع، يرجى التثبت.</p>}
        <section className="invoice-customer">
          <p className="invoice-kicker">FACTURÉ À / الحريف</p>
          <h2>{customer.name}</h2>
          <p>{customer.phone ? `Tél. ${customer.phone}` : "Téléphone non renseigné"}</p>
          {customer.notes && <p className="invoice-customer-notes"><strong>Adresse / complément :</strong> {customer.notes}</p>}
        </section>
        <div className={isInvoice ? "invoice-table-scroll" : undefined}>
          <PrintTable
            headers={isInvoice
              ? ["SKU", "Désignation / المنتج", "Quantité (pcs) / الكمية", "Prix unitaire (TND) / سعر الوحدة", "Total ligne (TND) / مجموع السطر"]
              : ["SKU", "Désignation / المنتج", "Quantité à livrer / الكمية للتسليم"]}
            rows={sale.items.map((item) => {
              const product = data.products.find((entry) => entry.sku === item.sku);
              const name = [product?.name_fr, product?.name_ar].filter(Boolean).join(" / ") || item.sku;
              const line = [item.sku, name, item.qty];
              const itemPriceMills = parseTndMills(item.unit_price_tnd);
              return isInvoice
                ? [...line, itemPriceMills === null ? "Non renseigné / غير محدد" : currencyFromMills(itemPriceMills),
                  itemPriceMills === null ? "Non calculable / غير قابل للحساب" : currencyFromMills(BigInt(item.qty) * itemPriceMills)]
                : line;
            })}
          />
        </div>
        {isInvoice ? (
          <section className="print-document-totals">
            <p><span>Sous-total / المجموع قبل التخفيض</span><strong>{saleCurrency(sale.subtotal_tnd)}</strong></p>
            <p><span>Remise ({sale.discount_percent} %) / التخفيض</span><strong>−{saleCurrency(sale.discount_tnd)}</strong></p>
            <p className="print-document-total-due"><span>Total net à payer / الصافي المطلوب</span><strong>{saleCurrency(sale.total_tnd)}</strong></p>
            <p><span>Montant encaissé / المبلغ المقبوض</span><strong>{currencyFromMills(paidMills)}</strong></p>
            <p><span>Reste à payer / المتبقي للدفع</span><strong>{currencyFromMills((totalMills ?? BigInt(0)) - paidMills)}</strong></p>
          </section>
        ) : (
          <section className="print-document-signatures">
            <p>Remis par / سلّم من طرف</p><p>Reçu par le client / استلم الحريف</p>
            <div><span>Nom, date et signature</span><span>Nom, date et signature</span></div>
          </section>
        )}
        {isInvoice && (
          <section className="invoice-signatures" aria-label="Visa et réception">
            <div><strong>Cachet et signature</strong><span>Signature du vendeur</span></div>
            <div><strong>Bon pour accord</strong><span>Nom et signature du client</span></div>
          </section>
        )}
        {sale.note && <p className="print-document-note">Note : {sale.note}</p>}
        <footer className="print-document-footer">
          {issuer.name} · {issuer.address} · Tél. {issuer.phone} · {issuer.email}
        </footer>
      </main>
    );
  }

  if (kind === "statement") {
    const customerId = Number(params.customer);
    if (!Number.isSafeInteger(customerId) || customerId < 1) notFound();
    const customer = data.customers.find((item) => item.id === customerId);
    if (!customer) notFound();
    const lines = [
      ...data.sales.filter((sale) => sale.customer_id === customerId && !sale.voided_at)
        .map((sale) => ({ date: sale.sale_date, reference: `Vente #${sale.id}`, debit: Number(sale.total_tnd), credit: 0 })),
      ...data.payments.filter((payment) => payment.customer_id === customerId && !payment.voided_at)
        .map((payment) => ({ date: payment.pay_date, reference: `Paiement #${payment.id}${payment.method ? ` · ${payment.method}` : ""}`, debit: 0, credit: Number(payment.amount_tnd) })),
    ].sort((left, right) => left.date.localeCompare(right.date) || left.reference.localeCompare(right.reference));
    const statementRows = lines.reduce<{ line: (typeof lines)[number]; balance: number }[]>((rows, line) => {
      const previousBalance = rows.at(-1)?.balance ?? 0;
      rows.push({ line, balance: previousBalance + line.debit - line.credit });
      return rows;
    }, []);

    return (
      <main className="print-document">
        <div className="print-document-actions no-print"><Link href="/management">Retour à la gestion</Link><PrintButton /></div>
        <DocumentHeading title="Relevé de compte client" number={`Client #${customer.id}`} />
        <dl className="print-document-details">
          <div><dt>Client</dt><dd>{customer.name}</dd></div>
          <div><dt>Téléphone</dt><dd>{customer.phone || "—"}</dd></div>
          <div><dt>Adresse</dt><dd>À compléter</dd></div>
          <div><dt>Période</dt><dd>Depuis le début des données enregistrées</dd></div>
        </dl>
        <table className="print-document-table">
          <thead><tr><th>Date</th><th>Référence</th><th>Débit (TND)</th><th>Crédit (TND)</th><th>Solde (TND)</th></tr></thead>
          <tbody>{statementRows.map(({ line, balance }, index) => (
            <tr key={index}><td>{line.date}</td><td>{line.reference}</td><td>{currency(line.debit)}</td><td>{currency(line.credit)}</td><td>{currency(balance)}</td></tr>
          ))}</tbody>
          <tfoot><tr><th colSpan={4}>Solde actuel</th><th>{currency(customer.balance)}</th></tr></tfoot>
        </table>
        <footer className="print-document-footer">KBM Stock · Relevé de compte client · {customer.name}</footer>
      </main>
    );
  }

  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) notFound();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const sales = data.sales.filter((sale) => sale.sale_date >= from && sale.sale_date <= to && !sale.voided_at);
  const payments = data.payments.filter((payment) => payment.pay_date >= from && payment.pay_date <= to && !payment.voided_at);
  const costs = data.shipmentCosts.filter((cost) => cost.cost_date >= from && cost.cost_date <= to);
  const movements = data.movements.filter((movement) => movement.mv_date >= from && movement.mv_date <= to);
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total_tnd), 0);
  const totalPayments = payments.reduce((sum, payment) => sum + Number(payment.amount_tnd), 0);
  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount) * Number(cost.fx_to_tnd), 0);

  return (
    <main className="print-document">
      <div className="print-document-actions no-print">
        <Link href="/management">Retour à la gestion</Link>
        <form action="/management/documents" method="get">
          <input type="hidden" name="kind" value="annual" />
          <label>Année <input name="year" type="number" min="2000" max="2200" defaultValue={year} /></label>
          <button type="submit">Afficher</button>
        </form>
        <PrintButton />
      </div>
      <DocumentHeading title={`Bilan de gestion — ${year}`} />
      <dl className="print-document-metrics">
        <div><dt>Ventes actives</dt><dd>{sales.length}</dd></div>
        <div><dt>Total des ventes</dt><dd>{currency(totalSales)}</dd></div>
        <div><dt>Paiements encaissés</dt><dd>{currency(totalPayments)}</dd></div>
        <div><dt>Frais containers saisis</dt><dd>{currency(totalCosts)}</dd></div>
      </dl>
      <h2>Mouvements de stock enregistrés</h2>
      <PrintTable
        headers={["Type", "Lignes", "Quantité (pcs)"]}
        rows={["arrivage", "vente", "casse", "ajustement"].map((type) => {
          const matching = movements.filter((movement) => movement.type === type);
          return [type, matching.length, matching.reduce((sum, movement) => sum + Math.abs(Number(movement.qty)), 0)];
        })}
      />
      <p className="print-document-note">
        Aperçu opérationnel calculé à partir des données enregistrées. Les frais sont regroupés par montant converti au taux saisi.
      </p>
      <footer className="print-document-footer">KBM Stock · Rapport interne — à vérifier avec votre comptable.</footer>
    </main>
  );
}
