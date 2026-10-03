# KBM Stock

A Next.js App Router dashboard starter for managing products, stock movements, shipments, sales, customers, and payments with Supabase.

## Requirements

- Node.js 20.9 or newer
- A Supabase project

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure `.env.local` with the Supabase project URL and publishable key. This workspace already has that file. Never add a service-role key to a `NEXT_PUBLIC_` variable or commit it.

   To enable the management assistant, set `N8N_CHAT_WEBHOOK_URL` and `N8N_CHAT_WEBHOOK_TOKEN` as server-only variables. The authenticated site posts `{ "question": "..." }` with `Authorization: Bearer <token>`; configure the n8n Webhook node for POST and return JSON shaped as `{ "answer": "..." }`. Keep the workflow read-only for business questions and configure its credential only in n8n. The assistant stays unavailable until both values are configured; the site does not expose the token or forward Supabase credentials.

3. In Supabase Authentication, confirm that the admin account `derbycafe33@gmail.com` exists and has a password. Create it if needed; do not enable public signup for this single-admin app.

4. Apply `supabase/migrations/20261002000001_admin_read_access.sql`, then migrations `20261002000002_web_management.sql` through `20261002000006_product_photo_import.sql` in order in the Supabase SQL editor. Together they limit access to the verified admin account, enable validated transactional management actions, deny anonymous access, prevent physical deletes through the web API, create a private product-image bucket, support reviewed bilingual product-name updates, and enable safe product-photo imports. The initial schema migration is only for a new database; do not apply it if these tables already exist.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`, then sign in with the admin account. The management area is available from **Gestion complète** or at `/management`.

## Database

The initial migration is in `supabase/migrations/20261002000000_initial_schema.sql`; it creates all tables in the supplied schema. `shipment_items.total_pcs` is a stored generated column. The dashboard and management workspace read products, stock movements, shipments, sales, customers, payments, and shipment costs directly from Supabase. Stock value is estimated using product sale prices and recorded stock movements. Sales are recorded through a database transaction that checks available stock before saving the sale, payment, and stock movements together. Container receipts also add stock movements atomically so a shipment cannot be received twice. Product source names remain untouched for the Telegram bot; the website can store French and Arabic display names and private JPG, PNG, or WebP photos (5 MB maximum). Use **Importer photos** in the management area to analyze a packing-list `.xlsx` locally in the browser and match embedded photos to existing product SKUs; upload goes directly to the private Supabase bucket and never through Telegram or an AI provider. Review the SKU match preview before starting; product stock, descriptions, and prices are not changed. Suggested translations can be reviewed and edited at **Traductions produits**; no product names are changed until you explicitly submit the reviewed batch. Client names, notes, sale/payment history, and balances are available in each client profile. No n8n translation webhook is configured in this workspace.

## Commercial documents and Tunisia

The management area can print internal sales documents, delivery notes, customer statements, and an annual operational summary using the browser's **Print → Save as PDF** feature. These outputs are explicitly marked internal/non-fiscal; they are not compliant tax invoices, certified e-invoices, statutory annual financial statements, or payroll documents. Before issuing official invoices, configure the legal seller/customer particulars, invoice numbering, tax treatment and any applicable e-invoicing connection with a Tunisian accountant or the competent authority.

The initial requirements review used the Tunisian tax administration's [VAT Code](https://jibaya.tn/docs/code-de-la-taxe-sur-la-valeur-ajoutee-2026/), [Finance Law No. 2025-17](https://jibaya.tn/wp-content/uploads/2025/12/Loi2025_17-1.pdf), and [Common Note No. 02/2026](https://jibaya.tn/docs/note-commune-n02-2026/), and the [Accounting System Law No. 96-112](https://www.cmf.tn/sites/default/files/pdfs/reglementation/textes-reference/loi_96-112_301296_fr.pdf). These are reference points, not a determination of KBM's tax regime or legal obligations. A PDF alone does not satisfy e-invoicing requirements. Employee/payroll administration is not implemented.

## Commands

- `npm run dev` starts the development server.
- `npm run lint` runs ESLint.
- `npm run build` creates a production build.
