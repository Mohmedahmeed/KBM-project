import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagementData } from "@/lib/management-data";
import { requireManagementAdmin } from "@/lib/management-access";

const currency = (value: number) => new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 3,
}).format(value);

export const metadata = { title: "Fiche client | KBM Stock" };

export default async function CustomerDetailsPage(props: PageProps<"/management/customers/[id]">) {
  await requireManagementAdmin();
  const { id } = await props.params;
  const customerId = Number(id);
  if (!Number.isSafeInteger(customerId) || customerId < 1) notFound();

  const data = await getManagementData();
  const customer = data.customers.find((item) => item.id === customerId);
  if (!customer) notFound();

  const transactions = [
    ...data.sales.filter((sale) => sale.customer_id === customerId).map((sale) => ({
      date: sale.sale_date,
      sortId: sale.id,
      type: "sale" as const,
      sale,
    })),
    ...data.payments.filter((payment) => payment.customer_id === customerId).map((payment) => ({
      date: payment.pay_date,
      sortId: payment.id,
      type: "payment" as const,
      payment,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.sortId - a.sortId);

  return (
    <main className="customer-detail-page" dir="rtl" lang="ar">
      <header className="customer-detail-header">
        <Link href="/management/customers">العودة إلى قائمة الحرفاء</Link>
        <div>
          <p>KBM STOCK / CLIENTS</p>
          <h1>{customer.name}</h1>
          <span dir="ltr">#{customer.id}</span>
        </div>
        <Link href={`/management/documents?kind=statement&customer=${customer.id}`} target="_blank">طباعة كشف الحساب</Link>
      </header>
      <section className="customer-detail-summary">
        <article><span>رقم الهاتف</span><strong dir="ltr">{customer.phone || "—"}</strong></article>
        <article><span>إجمالي المبيعات النشطة</span><strong>{currency(customer.sales)}</strong></article>
        <article><span>إجمالي المقبوضات</span><strong>{currency(customer.payments)}</strong></article>
        <article><span>الرصيد الحالي</span><strong>{currency(customer.balance)}</strong></article>
      </section>
      {customer.notes && <section className="customer-detail-notes"><h2>ملاحظات</h2><p>{customer.notes}</p></section>}
      <section className="customer-detail-history">
        <div className="customer-detail-section-heading">
          <div><p>HISTORIQUE</p><h2>سجل التعاملات</h2></div>
          <span>{transactions.length} حركة</span>
        </div>
        {transactions.length === 0 ? <p className="customer-detail-empty">لا توجد معاملات مسجلة لهذا الحريف بعد.</p> : (
          <div className="customer-detail-timeline">
            {transactions.map((transaction) => transaction.type === "sale" ? (
              <article className="customer-detail-transaction" key={`sale-${transaction.sale.id}`}>
                <div className="customer-detail-transaction-heading">
                  <div><span className="customer-detail-kind sale">بيع</span><strong>بيع رقم #{transaction.sale.id}</strong></div>
                  <time>{transaction.date}</time>
                </div>
                <ul>
                  {transaction.sale.items.map((item, index) => {
                    const product = data.products.find((candidate) => candidate.sku === item.sku);
                    return <li key={`${item.sku}-${index}`}><span>{product?.name_fr || product?.name_ar || item.sku} × {item.qty}</span><strong>{item.unit_price_tnd == null ? "السعر غير مسجل" : currency(Number(item.unit_price_tnd) * item.qty)}</strong></li>;
                  })}
                </ul>
                <div className="customer-detail-total"><span>{transaction.sale.voided_at ? "ملغاة" : "إجمالي البيع"}</span><strong>{currency(Number(transaction.sale.total_tnd))}</strong></div>
                {transaction.sale.note && <p>{transaction.sale.note}</p>}
                <Link href={`/management/documents?kind=invoice&sale=${transaction.sale.id}`} target="_blank">عرض الفاتورة الداخلية</Link>
              </article>
            ) : (
              <article className="customer-detail-transaction" key={`payment-${transaction.payment.id}`}>
                <div className="customer-detail-transaction-heading">
                  <div><span className={`customer-detail-kind payment${transaction.payment.voided_at ? " voided" : ""}`}>{transaction.payment.voided_at ? "ملغاة" : "قبض"}</span><strong>دفعة رقم #{transaction.payment.id}</strong></div>
                  <time>{transaction.date}</time>
                </div>
                <div className={`customer-detail-total${transaction.payment.voided_at ? " voided" : ""}`}><span>{transaction.payment.voided_at ? "دفعة ملغاة" : transaction.payment.method || "طريقة الدفع غير محددة"}{transaction.payment.sale_id ? ` · بيع #${transaction.payment.sale_id}` : ""}</span><strong>{currency(Number(transaction.payment.amount_tnd))}</strong></div>
                {transaction.payment.note && <p>{transaction.payment.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
