# KBM Stock

KBM Stock is a single-business commercial management web app built with Next.js 16, React 19, and Supabase. It provides a French-first management workspace with Arabic support for product names and generated internal documents.

This guide is intended for development, deployment, business onboarding, and first-line troubleshooting. Keep a copy with each installation and update it whenever the production setup changes.

## Important product and deployment limits

- **One business per installation and Supabase project.** The current app authorizes one administrator by a fixed email address (`derbycafe33@gmail.com`), and the database policies use the same single-admin model. Do not put multiple customers in one shared database or sell this build as a multi-tenant SaaS. Create a separate deployment and database for each business. A shared SaaS requires a separate tenant model, tenant-scoped policies, and a security review.
- **Customize the administrator before handing a copy to another business.** Update the fixed administrator identity in the application and in the database admin helper/policies, then apply and test the corresponding database change. Search for the current email and `kbm_is_admin` before delivery; do not just change the login screen or invite another user.
- **The web assistant is only a connectivity test today.** The current n8n test workflow returns a fixed test sentence; it is not an AI agent and does not read Supabase or business data. Do not present it as live business intelligence. The original Telegram bot is separate.
- **Printed documents are internal, not fiscal documents.** The invoice-style output, delivery note, customer statement, and annual summary are not certified tax invoices, compliant e-invoices, statutory accounts, or payroll documents. See [Commercial documents and Tunisia](#commercial-documents-and-tunisia).
- **The dashboard and management workspace are separate areas.** Management pages use Supabase; check labels and page notices in the running app to distinguish any sample/demo content from real records.

## Features

The management area is available at `/management`; sign in first with the configured administrator account.

| Area | Path | What it does |
| --- | --- | --- |
| Overview | `/management` | Commercial summary and recent alerts/activity |
| Products | `/management/products` | Product catalogue, display names, prices, and product information |
| Stock | `/management/stock` | Stock movements and available quantity |
| Shipments | `/management/shipments` | Containers, shipment lines, and receiving stock |
| Sales | `/management/sales` | Record sales and associated stock movements |
| Customers | `/management/customers` | Customer list; open a customer for profile, balance, and history |
| Payments | `/management/payments` | Customer payments |
| Container costs | `/management/costs` | Shipment-related costs |
| Product translations | `/management/translations` | Review French and Arabic product-name suggestions before saving |
| Import product photos | `/management/import-photos` | Match photos in an `.xlsx` packing list to existing product SKUs |
| Commercial documents | `/management/documents` | Print internal documents or use the browser's **Print → Save as PDF** |
| Assistant | `/management/assistant` | Calls the optional n8n webhook; see [Assistant status and setup](#assistant-status-and-setup) |

Product source names are kept separately from French and Arabic display names. Translation suggestions are not saved until an administrator reviews and submits them. Photo matching is based on existing SKUs; review the match preview before upload. Images are optimized in the browser and stored in a private Supabase Storage bucket, with a 5 MB per-image limit. The workbook is analyzed locally in the browser; the upload does not go through Telegram or an AI provider.

## Requirements

- Node.js 20.9 or later
- npm (the repository includes `package-lock.json`)
- A Supabase project
- Optional: an n8n instance for the assistant webhook
- A hosting provider that supports Next.js 16 for production

## Local setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root. Get the project URL and publishable key from the Supabase project settings. Do not put a service-role key in browser code, a `NEXT_PUBLIC_` variable, or Git.

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY

   # Optional. Needed only if the assistant webhook is configured.
   N8N_CHAT_WEBHOOK_URL=https://YOUR_N8N_HOST/webhook/YOUR_WEBHOOK_PATH
   N8N_CHAT_WEBHOOK_TOKEN=YOUR_LONG_RANDOM_SECRET
   ```

   `.env.local` is ignored by Git. Keep real values out of screenshots, issue reports, chat messages, and committed files. `N8N_CHAT_WEBHOOK_TOKEN` is server-only; never rename it to a `NEXT_PUBLIC_` variable.

3. Create the administrator in **Supabase → Authentication → Users** using the email allowed by the application. Use a strong, unique password. Public sign-up is not part of this single-admin application.

4. Prepare the database by following [Database setup and migrations](#database-setup-and-migrations).

5. Start the local server and open the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000` and sign in. The login page is `/login`.

6. Validate the changes and production build before deployment:

   ```bash
   npm run lint
   npm run build
   ```

## Database setup and migrations

All SQL changes live in [`supabase/migrations`](./supabase/migrations). Apply them in filename order, using the Supabase SQL Editor or the team's approved migration tool. Before applying SQL to an existing business database, take a backup and verify which migrations have already run. Do not blindly rerun migrations or apply the initial schema to tables that already exist.

### Migration sequence

| Migration | Purpose |
| --- | --- |
| [`20261002000000_initial_schema.sql`](./supabase/migrations/20261002000000_initial_schema.sql) | Creates the initial tables. **Only for a new, empty database.** |
| [`20261002000001_admin_read_access.sql`](./supabase/migrations/20261002000001_admin_read_access.sql) | Enables the initial admin-only, read-oriented access setup. |
| [`20261002000002_web_management.sql`](./supabase/migrations/20261002000002_web_management.sql) | Adds the web management database operations and access policies. |
| [`20261002000003_web_management_privileges.sql`](./supabase/migrations/20261002000003_web_management_privileges.sql) | Tightens table/function privileges and policies for web management. |
| [`20261002000004_product_media_and_translations.sql`](./supabase/migrations/20261002000004_product_media_and_translations.sql) | Adds product media and bilingual display-name support. |
| [`20261002000005_reviewed_product_translations.sql`](./supabase/migrations/20261002000005_reviewed_product_translations.sql) | Supports saving reviewed product translations. |
| [`20261002000006_product_photo_import.sql`](./supabase/migrations/20261002000006_product_photo_import.sql) | Adds the protected database operation used by product-photo import. |

For a **new empty database**, run all migrations from `20261002000000` through `20261002000006`, in order. For the existing KBM database, do not rerun the initial schema or migrations already applied; apply only missing migrations, in order. If unsure, inspect the schema and migration history or ask the database owner before running SQL.

The app uses the Supabase publishable key and authenticated user session. Row-level security and the database policies are essential parts of the security model; do not disable them to make a query work. Do not expose or add a service-role key as a workaround. Check the Supabase error and apply the correct pending migration instead.

### Data and transaction notes

- Products, shipments, shipment lines, customers, sales, sale lines, payments, shipment costs, and stock movements are stored in Supabase.
- Sale and shipment-receiving operations use database-side transactions to keep their related records and stock movements consistent.
- Product photos are stored in a private bucket; database records refer to the stored image path.
- Product import and translation tools operate on existing products; review proposed matches and translations before saving.
- The initial schema includes `import_drafts` and `pending_actions` tables for the separate bot integration. The website assistant does not use these tables.

## Production deployment

Use the hosting provider's documented Next.js 16 deployment method. The commands in this repository are:

- `npm run build` — create a production build
- `npm run start` — serve the production build

Before deploying:

1. Create a **separate production Supabase project for this business**. Do not connect a customer's deployment to the development database or another customer's database.
2. Confirm the target Supabase schema and apply only the required unapplied migrations in order. Back up existing data before schema changes.
3. Create the administrator account, configure a strong password, and confirm that the app's fixed admin identity and database admin helper match it.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the hosting provider's server/build environment settings. Add the two `N8N_CHAT_WEBHOOK_*` variables only if a working, correctly configured assistant webhook is being delivered.
5. Set the Supabase Authentication site URL and allowed redirect URLs to the production HTTPS domain, including the login callback/redirect URL used by the deployment. Test sign-in and sign-out on the real domain.
6. Use HTTPS, enable the provider's deployment access controls for previews, and keep production secrets out of preview builds unless they are needed there.
7. Run `npm run lint` and `npm run build`; deploy; then test sign-in, all management pages, read/write operations, photo upload, and print output with the production account.
8. Confirm that the live site's dashboard content is real business data and that any sample/demo UI is plainly identified. Never describe sample values as live Supabase data.
9. Record the deployment URL, Supabase project owner, migration version, backup procedure, and a support contact in the customer's handover notes. Never record passwords or tokens in this README.

Configure the deployment environment variables in the hosting provider's settings, not in source code. Changes to environment variables usually require a new deployment or server restart.

## Assistant status and setup

The server route at `/api/assistant/chat` checks the signed-in administrator, validates the question, and forwards only `{ "question": "..." }` to n8n. It sends `Authorization: Bearer <N8N_CHAT_WEBHOOK_TOKEN>` from the server and expects an HTTP success response containing JSON shaped as:

```json
{ "answer": "Text returned to the user" }
```

To configure a real integration:

1. Create a **separate** n8n workflow for the website. Do not modify the Telegram workflow to make the website assistant work.
2. Add a `POST` Webhook trigger with Header Auth. The credential's header name must be `Authorization` and its value must be `Bearer ` followed by a long random secret.
3. Connect the webhook to the intended assistant/response nodes. Ensure the final response is JSON with a non-empty string `answer`, and configure the Webhook to respond with the last node's result.
4. Keep the same secret in the server-only `N8N_CHAT_WEBHOOK_TOKEN` environment setting. Set `N8N_CHAT_WEBHOOK_URL` to the **production** webhook URL, not a temporary test URL.
5. Keep the workflow read-only until its tools, access scope, data minimization, and failure behavior have been reviewed. Do not give an AI node a service-role key or unrestricted database access.
6. Test the webhook directly with a valid token, test that a request without the token is rejected, and then submit a question from `/management/assistant` while signed in as the administrator.

**Current development integration:** the workflow named `KBM Web Assistant - Test` is published at the development n8n account's `kbm-web-assistant-test` path and returns a fixed connectivity-test sentence. It is not an AI assistant and is not connected to Supabase. Replace it with a separately reviewed workflow before presenting assistant answers as business data. Rotate the webhook secret if it has been exposed; update both n8n and the server environment at the same time.

## Commercial documents and Tunisia

The management area can print an internal sales document, delivery note, customer statement, and annual operational summary using the browser's **Print → Save as PDF** feature. These outputs are explicitly marked internal/non-fiscal; they are not compliant tax invoices, certified e-invoices, statutory annual financial statements, or payroll documents. Before issuing official invoices, configure the legal seller/customer particulars, invoice numbering, tax treatment and any applicable e-invoicing connection with a Tunisian accountant or the competent authority.

The initial requirements review used the Tunisian tax administration's [VAT Code](https://jibaya.tn/docs/code-de-la-taxe-sur-la-valeur-ajoutee-2026/), [Finance Law No. 2025-17](https://jibaya.tn/wp-content/uploads/2025/12/Loi2025_17-1.pdf), and [Common Note No. 02/2026](https://jibaya.tn/docs/note-commune-n02-2026/), and the [Accounting System Law No. 96-112](https://www.cmf.tn/sites/default/files/pdfs/reglementation/textes-reference/loi_96-112_301296_fr.pdf). These are reference points, not a determination of a specific business's tax regime or legal obligations. A PDF alone does not satisfy e-invoicing requirements. Employee/payroll administration is not implemented. Obtain current professional advice before relying on the app for legal or tax compliance.

## Customer onboarding and handover checklist

Use this checklist for each independent business installation:

- [ ] Create a separate source/deployment configuration and a separate Supabase project for the customer.
- [ ] Agree the customer's admin email, user access model, data ownership, hosting owner, support contact, and backup responsibility.
- [ ] Update the app's fixed admin identity and the SQL admin check together; verify RLS in the customer's project. Do not invite extra users until authorization has been deliberately redesigned and tested.
- [ ] Apply database migrations in order, excluding any migration already applied and excluding the initial schema if the customer's tables already exist.
- [ ] Set production secrets in the hosting provider. If using n8n, create a customer-specific workflow and credential rather than sharing another business's token or workflow.
- [ ] Import/verify product data, translations, prices, stock opening balances, customers, and historical records with the customer. Reconcile totals against their source documents before use.
- [ ] Upload and verify product photos; check that image files are private and visible only after an authorized sign-in.
- [ ] Exercise a small sale, payment, shipment receipt, and customer history review in a controlled test period. Confirm stock and balances before entering real transactions.
- [ ] Review the legal disclaimer and customer-specific seller details before using printed output. Obtain accounting/legal approval for any statutory use.
- [ ] Demonstrate login recovery, backup/restore ownership, how to report an error, and how to avoid editing records to conceal a business correction.
- [ ] Remove test/demo records and test credentials from the production tenant only after confirming they are not real records.

## Backups and operational care

Production business data is important. Agree with the business owner on a backup schedule, retention period, restore owner, and acceptable recovery time before handover. Use the Supabase plan's supported database backup/restore facilities or an approved backup process; confirm that it covers both relational data and Storage objects. A database-only backup may not contain product photos. Test a restore to a non-production project periodically and reconcile record counts and sample business totals.

Do not manually edit production tables or run ad hoc SQL to correct balances without a reviewed procedure and a current backup. Prefer the management workflows, which validate and save related records together. Record schema changes as new ordered migrations in `supabase/migrations/`; do not silently alter an already-applied migration.

## Troubleshooting

| Symptom | Checks and safe next steps |
| --- | --- |
| Login rejects the administrator | Confirm the account exists in the correct Supabase project, the password is correct, and its email matches the fixed admin identity in both app and database checks. Check the production Auth site/redirect URLs. |
| Management redirects to `/login` after sign-in | Confirm the signed-in email is the configured admin email and the Supabase URL/key point to the intended tenant. Check browser cookies and production HTTPS/Auth redirect settings. |
| Product reads show permission denied or fail | Confirm the correct Supabase project is configured, the user session is valid, RLS is enabled, and required admin/mangement migrations have been applied in order. Do not disable RLS or add a service-role key to the client. |
| Page loads but displays no records | Check that this is the correct tenant/database, that its tables have been populated, and that the Supabase query did not report an error. Empty data is not proof that migrations or imports succeeded. |
| A sale or shipment operation fails | Read the displayed database error, confirm product/customer/shipment references and stock availability, then retry only after verifying whether the first transaction was saved. Transactions should not be duplicated to work around an error. |
| Product photo import reports no matching rows | Confirm the `.xlsx` packing list contains supported embedded photos and SKU values that exactly match existing products. Inspect the match preview and correct source SKUs before uploading. |
| Product photo is not visible | Confirm the photo import completed, the product row has an image path, Storage policies/bucket migration are present, and the viewer is signed in with the authorized account. The bucket is private. |
| Assistant reports it is not configured (503) | Configure both server-only `N8N_CHAT_WEBHOOK_URL` and `N8N_CHAT_WEBHOOK_TOKEN` in the local or hosting environment, then restart/redeploy. |
| Assistant returns an n8n error (502/504) | Confirm the production webhook is published, the URL is correct, the Header Auth credential matches the server token, n8n is reachable, and the workflow returns `{ "answer": "..." }` within 25 seconds. Never paste the token into a public issue or browser code. |
| Assistant returns a fixed connectivity message | This is the current test workflow response. It does not indicate that Supabase was queried or that AI/business-data answers are enabled. |
| Print/PDF content is missing or marked internal | Confirm the sale/customer data is complete. These screens are internal operational documents only; the disclaimer is intentional. Get professional approval before any official use. |
| Local changes to environment variables have no effect | Restart `npm run dev`. For production, save the values in the hosting provider's environment settings and redeploy/restart the application. |

When escalating an issue, include the affected page, time, steps to reproduce, non-sensitive error text, deployment version, and migration version. Do not include passwords, access tokens, customer personal data, or unredacted database exports.

## Commands

- `npm run dev` — start the local development server
- `npm run lint` — run ESLint
- `npm run build` — create a production build
- `npm run start` — serve a production build locally
