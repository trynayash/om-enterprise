# OM ENTERPRISE — Business Management, Smart POS Billing, Payments & Inventory-ready System

**OM ENTERPRISE** · *Your Complete Building Solution*
Opp. Shardha Dhaba 2, Bodeli Road, Naswadi, Gujarat 391150 · WhatsApp 7621934414 · sweronkush@gmail.com

One connected system for the shop:

- **Public website**: catalogue, prices, enquiry list and order requests, WhatsApp contact.
- **Point of Sale**: Sachin can complete normal sales on his own. Prices and calculations come from the system.
- **Admin dashboard**: products, pricing, approvals, payments, bills, customers, staff, reports and settings.
- **Single PostgreSQL database** behind all of it.

> **Status (read first).** This release has been built and tested against a local PostgreSQL database. It has **not yet been deployed**.
>
> These parts are not verified:
> - **Razorpay gateway**: built from Razorpay's published API and tested with simulated, signed webhooks. It has **not** been run against a live Razorpay account.
> - **GST rules**: the document rules and tax rates follow official CBIC rules as researched (see [Billing & GST](#billing--gst)). They **must be confirmed by the shop's accountant** before real bills are issued.
>
> Real bills are blocked until the Super Admin confirms the GST registration type in **Settings → Tax**.

---

## Contents

1. [What's included](#whats-included)
2. [Architecture](#architecture)
3. [Installation (local)](#installation-local)
4. [Database & migrations](#database--migrations)
5. [Environment variables](#environment-variables)
6. [Creating the Super Admin and staff](#creating-the-super-admin-and-staff)
7. [Roles & permissions](#roles--permissions)
8. [Products & bulk import](#products--bulk-import)
9. [Pricing, discounts & margins](#pricing-discounts--margins)
10. [The POS sale workflow](#the-pos-sale-workflow)
11. [Payments](#payments)
12. [Billing & GST](#billing--gst)
13. [Reports](#reports)
14. [Sample data & training mode](#sample-data--training-mode)
15. [Security & audit](#security--audit)
16. [Testing](#testing)
17. [Deployment](#deployment)
18. [Backup & recovery](#backup--recovery)
19. [Known limitations](#known-limitations)
20. [Decisions & external dependencies still needed](#decisions--external-dependencies-still-needed)

---

## What's included

| Area | Highlights |
|---|---|
| Public website | Homepage, categories, product catalogue with search, filters and variants, configured selling prices, enquiry list, order requests, WhatsApp, about and contact pages, customer bill links |
| POS | New sale, product/SKU/barcode search, exact variant and unit, server-calculated cart, discounts within personal limits, approvals (remote or in person), quotations, exact-amount UPI QR, payment verification, customer details, bill, print/PDF/WhatsApp |
| Catalogue | Dynamic categories/subcategories, brands, products, variants (SKU, barcode, attributes), specifications, images, unit conversions, pipe/fitting compatibility, review-before-publish, Excel/CSV import |
| Pricing | One pricing engine everywhere; immutable price versions with effective dates, approval and history; quantity tiers; MRP guard; landed cost; margin and markup kept separate; price-review list |
| Sales | Drafts, quotations, finalisation with a frozen snapshot, reopen if unpaid, cancellation, returns with credit notes |
| Payments | Static UPI QR with exact amount and manual verification (UTR); cash, card, bank transfer and cheque; split payments; Razorpay dynamic QR with signed, idempotent webhooks; reversals and refunds |
| Billing | Tax Invoice, Invoice-cum-Bill of Supply, Bill of Supply, Cash Memo and Credit Note chosen by GST registration; gapless numbering per financial year; immutable snapshots; A4 PDF; share links |
| Reports | Sales, collections (cash flow), discounts, gross profit with cost coverage, staff, products, categories, below-cost sales, price changes; CSV export |
| Admin | Staff accounts, role templates, per-user grant/deny overrides, discount and approval limits, settings, append-only audit log |
| Inventory (ready, off) | Stock ledger, locations, suppliers, purchase receipts and reorder levels in the schema. Never deducts stock or shows it publicly until enabled. |

---

## Architecture

```
Browser (public site · POS · dashboard)
        │  HTTPS, same-origin JSON, HttpOnly session cookie
        ▼
Next.js 16 (App Router, React 19, TypeScript)
  ├─ src/app/(public)/…       public website (server components, request-time data)
  ├─ src/app/pos/…            POS screens
  ├─ src/app/dashboard/…      admin dashboard
  ├─ src/app/api/…            REST API (one thin handler per endpoint)
  ├─ src/server/http.ts       every API call: origin check → session → permission → zod validation → errors
  ├─ src/server/services/…    business logic (catalog, pricing, sales, payments, documents, reports, users…)
  ├─ src/lib/pricing/engine.ts   THE pricing & tax engine (pure, decimal, unit-tested)
  └─ src/server/db/schema.ts  Drizzle schema
        │  node-postgres (pool)
        ▼
PostgreSQL 16
  ├─ drizzle/0000_schema.sql      tables, constraints, indexes
  └─ drizzle/0001_integrity.sql   record-retention triggers + row-level security lockdown
```

**Key design decisions**

- **One pricing engine** (`src/lib/pricing/engine.ts`). The POS, quotations, website order requests, bills, credit notes and reports all use it. It uses exact decimal arithmetic (`decimal.js`), never floats.
- **The server is authoritative.** The browser never sends prices. Every cart change is re-priced on the server from the active price version.
- **Financial history is protected by the database itself**, not only by the app. Triggers make these rules hold:
  - audit logs, cost versions, stock movements and returns are append-only;
  - a finalised sale's lines and totals are frozen;
  - issued documents can only be cancelled (with who, when and why), never edited or deleted;
  - payments follow a fixed state machine (pending → successful → reversed);
  - document numbers only move forward;
  - no financial row can be deleted or truncated.
- **Snapshots.** Each issued document stores a complete JSON snapshot (seller, buyer, lines, taxes, payments, terms). Screens, print and PDF all render from that snapshot, so a reprint years later is identical.
- **Authorisation is enforced on the server** in every API route and page (`requirePermission`, `requirePageActor`). Hiding a button is never the protection.
- **No paid services are required.** It runs on any Node host with PostgreSQL. Payment gateways are optional.

**Directory guide**

| Path | Purpose |
|---|---|
| `drizzle/` | SQL migrations (schema + integrity triggers) |
| `scripts/` | `migrate.ts`, `create-super-admin.ts`, `seed-demo.ts`, `backup.sh`, `restore.sh` |
| `src/lib/` | Shared pure code: money, pricing engine, India/GST helpers, permissions, settings schema, validation |
| `src/server/` | Server-only: DB, auth, audit, settings, services, payments providers, PDF |
| `src/components/` | UI kit (`ui/`), document view, POS, dashboard and public components |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest unit tests, Vitest tests against real PostgreSQL, Playwright browser tests |
| `assets/fonts/` | DejaVu Sans (has the ₹ glyph) for PDFs, and Noto Sans Devanagari and Gujarati for Hindi and Gujarati names on bills, with their licences |

---

## Installation (local)

**Prerequisites:** Node.js 20.9+ (22 recommended), npm, PostgreSQL 14+ (16 recommended).

```bash
git clone <repo> om-enterprise && cd om-enterprise
npm ci
cp .env.example .env            # then edit DATABASE_URL / TEST_DATABASE_URL / APP_SECRET

# create databases (example for a local PostgreSQL)
createuser -P om                # choose a password, put it in .env
createdb -O om om_dev
createdb -O om om_test          # used by integration tests (wiped on every run)

npm run db:migrate              # schema + integrity rules + reference data
npm run create-super-admin      # prompts for Kishan's username & password
npm run seed:demo               # OPTIONAL: SAMPLE products for training (see below)
npm run dev                     # http://localhost:3000  (owner: /admin, staff: /login)
```

---

## Database & migrations

- `npm run db:migrate` applies every migration in `drizzle/`, then idempotent **reference data**: roles and default permissions, units, GST rate classes, price lists, default settings, the eight initial categories and the main stock location. It is safe to run on every deploy and never overwrites changes made later in the app.
- **Changing the schema:** edit `src/server/db/schema.ts`, run `npm run db:generate -- --name=<change>`, review the generated SQL and commit it. For triggers or other custom SQL, use `npx drizzle-kit generate --custom --name=<name>`.
- Migration `0001_integrity.sql` enables row-level security on every table, with no policies. The app connects as the table owner (which bypasses RLS). This means a hosted database's auto-generated REST API (e.g. Supabase `anon`/`authenticated` roles) cannot read or write any table.
- **New tables** need `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in their migration. Financial tables also need matching retention triggers.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. Use `?sslmode=require` for managed databases. |
| `TEST_DATABASE_URL` | tests | A separate database. **It is wiped** by `npm run test:integration`. |
| `APP_BASE_URL` | yes (prod) | Public URL, e.g. `https://omenterprise.in`. Used for the same-origin check and share links. |
| `APP_SECRET` | yes | ≥ 32 random characters. Keyed hashing of IP addresses for rate limits and enquiries. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `DATABASE_URL_UNPOOLED` | no | Direct (non-pooled) connection used by migrations when the host also gives a pooled one (Neon sets it). |
| `UPLOAD_STORAGE` | no | `local` (default) keeps product images under `UPLOAD_DIR`; `database` keeps them in PostgreSQL, for hosts without a persistent disk. Defaults to `database` on Vercel. |
| `UPLOAD_DIR` | no | Where product images are stored with `UPLOAD_STORAGE=local` (default `./storage/uploads`). Must be persistent storage. |
| `SA_USERNAME`, `SA_NAME`, `SA_PASSWORD` | first deploy | Owner account created by `create-super-admin --if-missing` (hosted builds). The password is temporary; remove it after the first sign-in. |
| `TRUST_PROXY` | no | `true` (default) reads client IPs from `X-Forwarded-For` set by your reverse proxy. Keep the app port private (only the proxy may reach it). |
| `TRUST_PROXY_HOPS` | no | Number of reverse proxies in front of the app (default `1`). The client IP is taken that many entries from the right of `X-Forwarded-For`, so a forged header can't dodge rate limits. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | optional | Only for the Razorpay dynamic-QR integration. |
| `DB_POOL_MAX` | no | Connection pool size (default 10). |

All variables are server-only. Never put secrets in `NEXT_PUBLIC_*` variables, and never commit `.env` files.

---

## Creating the Super Admin and staff

There is **no default administrator password**.

1. **Kishan Suthar (Super Admin)**: run `npm run create-super-admin`, or with Docker:
   ```bash
   docker compose --env-file .env.production run --rm tools npm run create-super-admin
   ```
   Non-interactive form (values are never logged):
   ```bash
   SA_USERNAME=Kishan SA_NAME="Kishan Suthar" SA_PASSWORD='…' npm run create-super-admin
   ```
   - The password must be at least 12 characters and must not contain the username.
   - A password given in the environment (for example from a handover note) is **temporary**: it must be changed at the first sign-in. A password typed at the interactive prompt is not.
   - The command refuses to run if a Super Admin already exists. Pass `--additional` only to add a second owner deliberately.
2. Kishan signs in at **`/admin`** (staff use `/login`; both lead to the same accounts), replaces the temporary password, and is offered a **secret key** (see below). Then he opens **Dashboard → Staff & access → Add staff member**:
   - **Yash**, role *Admin*
   - **Vikram Uncle**, role *Admin*
   - **Sachin**, role *Sales & Operations*

   Each person gets a generated temporary password and must choose their own at first sign-in.
3. Adjust each person individually (shield icon): grant or deny single permissions, and set discount and approval limits.

### Secret key (second sign-in step)

- Anyone can add a secret key at **Account → Secret key** (`/account/security`). It is asked after a correct username and password at every sign-in, and also when that person approves a discount in person at the counter.
- Adding, changing or removing the key needs the current password (and the current key). Adding or changing it signs out other devices.
- The key step allows 3 tries per sign-in and expires after 5 minutes. Wrong keys count towards the same account lockout as wrong passwords.
- Keys are stored only as scrypt hashes, like passwords.
- **Forgotten key:**
  - Staff: the Super Admin clears it in Staff & access (shield-off icon).
  - The Super Admin's own key: run `npm run reset-login-secret -- Kishan` on the server (with Docker: `docker compose --env-file .env.production run --rm tools npm run reset-login-secret -- Kishan`). It signs out all of that account's sessions.
- **Forgotten Super Admin password** with no other Super Admin: create a second owner with `npm run create-super-admin -- --additional`, sign in as them and reset Kishan's password from Staff & access.

---

## Roles & permissions

Permissions are enforced on the server for every page and API call. Effective permissions are: role template + per-user *grant* overrides − per-user *deny* overrides.

| Role | Default access |
|---|---|
| **Super Admin** (Kishan) | Everything, with no limits. The only role that can: assign roles or permissions, grant or revoke Super Admin, change security/inventory/tax settings, and manage administrators. |
| **Admin** (Yash, Vikram Uncle) | Catalogue (create, edit, publish, import), *propose* prices (they wait for approval), view costs and margins, POS, all sales, payment recording and verification, documents, customers, website orders, reports and export. Discount limit 10%; can approve others up to 15%. |
| **Sales & Operations** (Sachin) | POS sales and quotations, discounts within 5%, UPI QR and payment verification, bills, reprint and share, customers, website orders, own sales history. **No** costs, margins, price editing, settings or staff. |
| **Accountant / Auditor** (future) | Read-only: all sales, payments, documents, reports with profit, CSV export, audit log. |

**Powers that are NOT given to Admins by default** (the Super Admin can grant them per person): approving master prices (`prices.approve`), recording costs (`costs.edit`), discount policy (`discounts.configure`), tax settings (`settings.tax`), cancelling bills (`documents.cancel`), refunds, reversing payments, staff management (`users.manage`), selling below cost, and overriding prices.

**Escalation guards**
- Nobody can change their own role, permissions, limits or active status.
- Only the Super Admin can assign roles, grant or revoke Super Admin, or edit permissions.
- A user granted `users.manage` can manage *Sales* staff only, never Admins or the Super Admin.
- The last active Super Admin can never be deactivated or demoted.
- Deactivating someone or changing their role signs them out immediately.

The full permission catalogue, with descriptions, is in `src/lib/permissions.ts` and is visible in **Staff & access**.

---

## Products & bulk import

- **Categories** are dynamic, with subcategories, icons, publishing and margin overrides. The eight starting categories are created at install: Berger Paints; Umiya Gold Water Tanks; Bathware & Sanitary Fittings; CPVC Pipes & Fittings; PVC & UPVC Pipes & Fittings; SWR & Drainage Systems; Plumbing Accessories; Other Building Materials.
- **Products → variants.** Every sellable variant has its own SKU (unique), optional barcode, attributes (e.g. Colour, Pack size, Size, Class), unit, tax-class override and its own price history.
- **Units:** pcs, nos, ltr, bucket, m, ft, length, kg, box, set, roll, pack, bag. Alternate selling units exist only where explicitly configured per variant (e.g. "1 length = 3 m", "1 box = 10 rolls"); no other unit conversion is allowed.
- **Compatibility** links (e.g. a ¾" CPVC elbow ↔ ¾" CPVC pipe) are explicit. Nothing is assumed compatible.
- **Publishing:** new and imported products are unpublished drafts. Someone with `catalog.publish` marks the information *reviewed* and then publishes it, or ticks *Publish on the website straight away* when importing. Editing key fields of a reviewed product sends it back to review.
- **Data integrity:** never enter invented specifications, prices, warranties or stock. Record where data came from in *Source info*.

### Importing a company's price list or catalogue (Dashboard → Bulk import)

Upload the file as the company sent it. Files are read in the browser (`src/lib/import-files/`); the file type is decided by its content, not its name, because many billing systems save "Excel" files that are really web pages or text.

| Format | How it is read |
|---|---|
| PDF | [Mozilla pdf.js](https://github.com/mozilla/pdf.js) gives each text-drawing operation and its position, and the lines and boxes drawn on the page; the tables are rebuilt from them (`pdf-ops.ts`, `layout.ts`). Borders, when there are any, mark the rows and columns, and cells wrapped over several lines are joined. Text-only spreadsheet, Word, browser and catalogue PDFs all work, including pages turned sideways. Scans and photos have no text and are refused with an explanation, as are password-protected PDFs |
| Excel `.xlsx`, `.xlsm`, `.xls` (97–2003) | Every sheet; `.xls` through a small reader for the binary format |
| OpenDocument `.ods`, Word `.docx`, web pages `.html` | Every table in the file |
| CSV, TSV, `.txt`, `.prn` | Comma, semicolon, tab or `\|`, UTF-8, UTF-16 or Windows-1252 |
| JSON | A list of records |

| Scanned PDFs, photos (`.jpg`, `.png`, `.webp`, `.gif`, `.bmp`) | Text recognition with [Tesseract](https://github.com/tesseract-ocr/tesseract) (through [tesseract.js](https://github.com/naptha/tesseract.js)), English, Hindi or Gujarati (chosen on the import page), in a web worker in the browser — see below |

Old Word `.doc`, Excel `.xlsb`, Apple Numbers and `.tiff`/`.heic` files are refused with the steps to save them in a format that works.

**Scans and photos.** A PDF page that is one picture covering most of the page, with almost no text of its own, is a scan; a picture file is read the same way. Each page is straightened (the tilt of the text lines is measured and undone), turned upright if it was fed in sideways or upside down, evened out if a phone photo has shadows, enlarged or reduced to the size Tesseract reads best, and the table's border lines are found and painted out (they make the engine drop or garble words next to them) and then used to place cells, like the borders of a text PDF. Every number is read a second time on its own, cut out and limited to digits, which recovers most lost decimal points. The result goes into the same table rebuilding as a text PDF. It takes about 10–20 seconds a page, with a progress message and a Cancel button. A photo catalogue — pictures with a caption under each — is *not* sent to recognition: its text is read directly.

Recognition is good, not perfect (a 7 for a 1, an inch mark read as `%`), so for scans the import screen says so, marks every price that does not fit its neighbouring sizes or the usual dealer share of the MRP (a lost decimal point turns 11.5 into 115) in a "Check" column, and always saves the products as unpublished drafts. The engine's files are served from this site (`public/ocr/`, copied from `node_modules` by `scripts/copy-engine-files.mjs` before `next dev` and `next build`, not committed), so nothing is downloaded from another address and the file never leaves the computer. WebAssembly, which the engine needs, is allowed by the content security policy only for `/ocr/*` and the import page (`next.config.ts`).

**Hindi and Gujarati.** The import page has a "Language of scans and photos" choice — English (the default), English + Hindi, English + Gujarati, or all three — remembered in the browser; changing it re-reads a scan that is already loaded. English is always read with the other language because price lists mix them (item codes, prices and sizes are Latin). The combined engine has two known weaknesses, so the words it is unsure of get a second reading, each cut out and read on its own (`src/lib/import-files/reread.ts`): a Hindi or Gujarati phrase with a weak word is read again by the engine for that script alone (the combined one turns joined letters such as एल्बो into English nonsense like "gear"), and item codes are read again limited to Latin letters, digits and `- . / _` (so `GJ-101` does not come out as `62-101` or `GJ101`). A second reading replaces the first only when it is plainly better. Both single-script engines are started only when a Hindi or Gujarati language is chosen, so a scan takes longer and uses more memory than an English one (a page of the test scans takes about ten seconds on a computer; a phone is slower). The recognition data (`hin` 1.4 MB, `guj` 1.2 MB, on top of English's 3 MB) is downloaded from this site the first time, then kept by the browser.

The rest of the import copes with Hindi and Gujarati names too: Hindi and Gujarati column headings (नाम / નામ, कोड / કોડ, एमआरपी / એમઆરપી, दर / ભાવ, जीएसटी / જીએસટી …) and units (नग / નંગ, किलो / કિલો, मीटर / મીટર, सेट / સેટ …) are matched, Hindi and Gujarati digits (१२३ / ૧૨૩) are read as numbers, and `रु` / `રૂ` before a price is dropped. A name with no Latin letters or digits still gets a page address and item code (the brand and item code, or a short code worked out from the text) so that products never end up without an address or with two the same. Digits written inside a product *name* are left as they are.

On bills, a name containing Devanagari or Gujarati letters is printed in Noto Sans Devanagari or Noto Sans Gujarati ([SIL Open Font Licence](assets/fonts/LICENSE-Noto-OFL.txt); both include Latin letters, digits and ₹) and everything else in DejaVu Sans. A single string that mixes Hindi and Gujarati letters prints the part in the other script as empty boxes — the public website relies on the visitor's own fonts for these scripts.

Then **match the columns**: pick the sheet or page (a PDF also offers "All pages") and the heading row, say which column is the name, size, code, MRP, selling and dealer price, GST, HSN, unit and so on (guessed from the headings), and fill in what is the same for every row — category, brand, unit, GST and HSN. Rules cover common price-list layouts: a heading row above each product's sizes becomes the product name; repeated page headers and footers are left out; the selling price can be the MRP or MRP less a discount; the cost can come from a dealer price column (with or without GST) or MRP less the dealer discount; item codes can be made from the brand, name and size when the file has none. A preview shows the rows that will be checked, and the choices are remembered for the next file with the same columns. A file that already uses the template's headings skips this step.

**Check** sends only the matched rows, in the template's columns. A row whose code is already in the catalogue can be left out with one click, so a new price list from the same company imports just its new items. Up to 5,000 rows at a time.

The template (download it from the import page) has one row per variant. Rows with the same `product_name + brand + category` become one product.

| Column | Required | Notes |
|---|---|---|
| `product_name`, `category` (slug or name), `unit` (code), `sku`, `variant_name` | ✔ | |
| `brand`, `manufacturer`, `model`, `description`, `warranty`, `source_info` | | A new brand is created if needed |
| `hsn_code` (4–8 digits), `gst_rate` (must match a tax class) | | |
| `specifications` | | `Label: Value; Label: Value` |
| `variant_attributes` | | `Colour=White; Pack size=20 L` |
| `barcode`, `mrp`, `selling_price`, `price_includes_tax` (yes/no) | | Prices need `prices.edit`; they go *pending* unless the importer can approve |
| `purchase_cost`, `purchase_tax_rate`, `freight`, `handling` | | Need `costs.edit` |
| `is_sample` (yes/no) | | Marks demonstration data |
| `image_url` | | Up to 4 links to the product photo on the maker's website, separated by spaces. Downloaded after the import is saved; needs `catalog.edit` |

**Validate** gives a row-by-row report: duplicate SKUs or barcodes (against the database and within the file), missing fields, unknown categories, units or tax rates, invalid numbers, price above MRP and malformed photo links. **Import** is enabled only when there are no errors, and it is all-or-nothing.

Photos are fetched after the products are saved, so a broken link never undoes an import; each photo that could not be added is listed with the reason. The server only downloads from public internet addresses (checked on every redirect), only image files, up to 6 MB each (`src/server/remote-image.ts`).

### Real catalogue files (`data/catalog/`)

The brands the shop stocks (Berger, Truflo by Hindware, Finolex, Umiya Gold, AGL, Blues, Plumber) are kept as JSON files researched from public manufacturer sources. The format and rules are in [`data/catalog/README.md`](data/catalog/README.md).

```bash
npm run import:products -- --check     # validate only
npm run import:products                # add missing products as unpublished drafts
npm run import:products -- --publish   # also mark new products reviewed and publish them
```

- Idempotent by SKU. A later run adds new variants, a price for a variant that never had one, and images for products that still have none.
- List prices are imported as **pending proposals** for the Super Admin (Price review). Until one is approved the website shows "Price on request".
- Image URLs are downloaded on the server, re-encoded and stored like any upload. A failed link is reported and skipped.
- Hosted builds (`npm run vercel-build`) run the import with `--publish` on every deploy.

---

## Pricing, discounts & margins

### Price versions
- Each price change creates a new, **immutable version** containing: price, tax-inclusive flag, MRP, quantity tiers, effective-from date, reason, the previous price, the landed-cost snapshot and the margin before and after.
- The **active price** is the latest approved version whose effective date has passed. Future-dated prices are supported; back-dating is not.
- With **Settings → Price changes → "require approval"** on (the default), changes made by staff without `prices.approve` stay *pending* until the Super Admin approves them (Approvals or Price review).
- Selling price can never exceed the MRP (inclusive of tax).
- **Price lists:** Retail is the default and the public list. Wholesale and Contractor exist but are inactive, ready for the future.

### Costs & margins
Formulas:

```
Landed unit cost  = purchase cost
                    + purchase GST (ONLY if input tax credit is not recoverable)
                    + freight + handling + other non-recoverable costs
Gross profit      = net revenue excl. output GST − cost of goods sold
Gross margin %    = gross profit / net revenue × 100      (on selling price)
Markup %          = gross profit / cost × 100             (on cost — a different number)
Price for target margin m (0 < m < 1) = landed cost / (1 − m)
```

- **ITC policy:** regular GST registration treats input GST as recoverable, so it is excluded from cost. Composition, unregistered or unconfirmed registration includes it.
- The policy in force is stored on each cost version.
- Enter freight and handling **net of any recoverable GST**, to avoid double counting.
- Profit is reported only where cost is known, together with a cost-coverage %. It is **gross** profit, never net profit.

### Discount controls
- **Personal limits:** each user has a discount limit (role default or a per-person value) and, if allowed to approve, an approval limit.
- **Calculation order** (GST s.15(3)(a)):
  1. Line discount (percentage or fixed amount).
  2. Cart discount, allocated across discount-eligible items in proportion to their value, to the paisa.
  3. Tax on the discounted value.

  Charges (e.g. delivery) are never discounted.
- **Price overrides** need `pricing.override_price` and a reason. They count as a discount against the authorised price.
- **Approval is required** when the largest line discount or the overall discount exceeds the operator's limit. It is also required when any item would sell below cost or below the minimum margin, unless the operator holds `pricing.sell_below_cost`.
- **Approval is bound to a fingerprint of the exact cart** (items, quantities, prices, discounts, place of supply). Any change means a new approval is needed.
- **Two ways to approve:**
  - *Request approval*: the request appears under Dashboard → Approvals.
  - *Manager approves here*: the approver types their own username and password on the cashier's screen. This is rate-limited, and the approver's identity is recorded, not the cashier's.
- **Approver rules:** the approver needs `discounts.approve` and a high enough approval limit. Below-cost approvals also need `pricing.sell_below_cost`. Nobody can approve their own request.
- **What is recorded:** original price, discount, final price, cost snapshot, margin, who applied it, who approved it, when, and why.

---

## The POS sale workflow

1. **New sale** creates a sale number (`S000123`).
2. **Search** by name, brand, SKU, barcode or category, then choose the exact variant, unit and quantity. The quantity must suit the unit (whole pieces, decimal metres…).
3. **Review the cart.** Totals are calculated on the server: line and bill discounts, taxable value, CGST/SGST or IGST, round-off and grand total.
4. **Discounts:** within the user's limit, or with approval.
5. **Finalise:** the customer agrees the amount, and the sale's lines and totals are frozen.
   - A draft can be saved, or a **quotation** issued. A quotation holds its prices for the validity period.
   - An unpaid finalised sale can be reopened.
6. **Customer, before any QR.** Once the amount is agreed the screen asks who is buying: name and a valid 10-digit mobile are needed to go on (the bill is made out to them and can be sent to that number on WhatsApp); email is optional. Address, GSTIN and business name sit under "more details" and open by themselves when the bill needs them: a GST-registered buyer, or a bill at or above the threshold on a regular registration. Those rules are checked **here**, with the same code that issues the bill, so a missing address or a wrong state is found before the customer pays, not after. A walk-in who gives nothing can be recorded as "Walk-in — no details" (not allowed where the law wants the buyer's details). A mobile number and name already on file is the same customer, not a second one — nothing saved is blanked. A sale already being paid is not held up for this step.
7. **Payment QR** for the exact outstanding amount (UPI, or Razorpay when configured), with the customer shown above it.
8. **Verify payment.** This is automatic only with a gateway webhook. Otherwise staff check the merchant app and record the 12-digit UTR and explicit confirmation. Split payments are supported.
9. **Generate the bill** for the customer already taken (still changeable here). The document type comes from the GST registration — a **Bill of Supply** (with the composition declaration and no tax) for a composition dealer — and the number is allocated gaplessly.
10. **Saved and searchable.** On the bill page: **Print** (A4), **PDF**, **Email** (one click, to the address taken in step 6), **WhatsApp** (a private link) and **Copy link**.

Returns create credit notes against the original bill and record refunds. Cancelling a bill (goods not supplied) requires the refund to be recorded first, and keeps the cancelled document and its number.

---

## Sending bills by email

**Email** on the bill page sends the bill to the customer as a PDF, with a short note in plain words and (when share links are on) a link to view it online. The page says where it will go ("Email goes to ramesh@example.com"), and one click sends it. **send to another address** opens a small box for a different one; a bill with no address on it opens the same box, and can keep the typed address on the customer for next time.

- Only an issued bill or quotation is sent: never a cancelled document or a practice (training) bill. A bill can be emailed up to 5 times. Every send, and every failed send, is in the audit log (the log line shows `r***@example.com`; the full address is in the record).
- Needs the permission to share bills (Sales staff and Admins have it). The reply-to is the shop's email on the bill, so a customer's reply goes to the shop.
- The app cannot send mail until the shop's email service is connected. Until then the button is disabled and says so.

**Setup** (once, on the server; nothing to change in the shop's settings): bills go through [Resend](https://resend.com), over HTTPS.

1. In Resend, verify a sending domain (Domains → Add domain, then the DNS records it shows). Customers see this domain in the From line.
2. Create an API key with sending access only.
3. Set two environment variables on the host (Vercel: Project → Settings → Environment Variables) and redeploy:

   | Variable | Example |
   | --- | --- |
   | `EMAIL_FROM` | `OM ENTERPRISE <bills@your-verified-domain>` |
   | `RESEND_API_KEY` | `re_…` (secret, never commit it) |

For development and tests, `EMAIL_OUTBOX_DIR=./storage/outbox` (with `EMAIL_FROM`) writes each message to a folder instead of sending anything: one folder per message with `message.json` and the PDF. The e2e and walkthrough runs use it.

---

## Payments

### Static UPI QR (default; free)
- **Setup:** Settings → Payments → enable UPI QR, enter the shop UPI ID and payee name.
- The QR follows the NPCI UPI linking specification (`upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`). It carries the exact amount and the sale number.
- **There is no programmatic way to confirm payment to a plain UPI ID.** A customer can always pay a different amount manually. A sale is therefore marked paid only after an authorised staff member:
  1. checks the shop's UPI or bank app;
  2. records the **12-digit UTR / UPI Ref. No.**;
  3. ticks an explicit "I have checked and confirm ₹X was received".
- A UTR can confirm only one payment, across UPI and bank transfers (enforced by a database unique index).
- A QR request can only be confirmed as UPI, with its UTR. If the customer pays cash instead, close the QR ("Customer couldn't pay") and record the cash separately.
- Customers should **scan** the QR. NPCI blocks "pay via UPI app" intent links to personal or unverified UPI IDs, and "share & pay" from the gallery is capped at ₹2,000 for unverified merchants.
- **Per-payment limit:** most UPI merchant payments are limited to ₹1,00,000 each (configurable). Larger bills are paid in parts.
- A merchant category code (MCC) should be set only if the UPI ID is a verified merchant account.

### Cash, card, bank transfer, cheque
- **Cash:** counted at the counter; enter the amount tendered to calculate change.
- **Card:** taken on a separate card machine; record the approval code.
- **Bank transfer:** record the transfer reference after checking the bank statement.
- **Cheque:** record it only after it clears.

### Razorpay dynamic QR (optional, automatic confirmation)
Implemented in `src/server/payments/providers.ts` against Razorpay's documentation. **It has not been verified against a live account.**

1. **Account:** create a Razorpay account and ask Razorpay to **activate QR Codes** (an on-demand feature). Check your platform fee for UPI.
2. **Webhook:** add one in the Razorpay Dashboard:
   - URL: `https://<your-domain>/api/payments/webhook/razorpay`
   - Event: **`qr_code.credited`**
   - Secret: a strong random secret.
3. **Environment:** set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, then choose *Razorpay* under Settings → Payments.
4. **Behaviour:**
   - The POS creates a single-use, fixed-amount QR (amount in paise; closes within 2 hours).
   - The webhook is verified with HMAC-SHA256 over the raw body, de-duplicated by event id (idempotent), and checked for amount and currency.
   - Only then is the payment marked successful.
   - A mismatched amount, or a payment on a closed QR, is flagged in the audit log for manual review.
5. **Testing:** Razorpay test-mode QR codes cannot be scanned. Test with ₹1 **live** payments and refund them, with the owner's authorisation. Never test with customers' money.

**Payment status vs bill status.**
- Sale payment status: unpaid, partially paid, paid, partially refunded, refunded.
- Payment record status: pending, initiated (QR shown, **not** proof), successful, failed, expired, cancelled, reversed.
- A wrongly confirmed payment can be **reversed** with a reason (`payments.reverse`); the record is kept.

---

## Billing & GST

> Based on research of the CGST Act and Rules: Rules 46, 46A, 49 and 53; s.10, s.15(3), s.31, s.32, s.34; Notification 78/2020; GST rates after 22 Sept 2025. **Confirm all of this with the shop's accountant** before issuing real bills.

| Settings → Tax → registration | Document issued | Tax shown |
|---|---|---|
| **Regular GST** | **Tax Invoice**. Mixed taxable and exempt items to an unregistered buyer: **Invoice-cum-Bill of Supply** (Rule 46A). Only exempt items: **Bill of Supply**. A mixed taxable/exempt bill to a registered buyer is refused; bill the exempt items separately. | CGST + SGST (same state) or IGST (other state) |
| **Composition** | **Bill of Supply** headed *"Composition taxable person, not eligible to collect tax on supplies"*. Inter-state sales are blocked (s.10(2)(c)). | none |
| **Unregistered** | **Cash Memo** | none (GST must not be collected, s.32) |
| **Not confirmed** (default) | Real bills are blocked; training sales only | — |

- **Numbering:** `PREFIX/YY-YY/00001`, e.g. `OE/26-27/00042`.
  - At most 16 characters, using letters, digits, `/` and `-` only (Rule 46(b)).
  - A separate gapless series per document type and financial year (1 April, IST).
  - Numbers are never reused. A cancelled bill keeps its number.
  - Prefixes are set in Settings → Documents.
- **Recipient details** on a Tax Invoice:
  - for a GST-registered buyer: name, address and GSTIN. The GSTIN is checked for format, state code and check digit.
  - for an unregistered buyer with taxable value ≥ ₹50,000: name, address and state (Rule 46(e); the threshold is configurable).
- **HSN:** the minimum digits for registered buyers is configurable (4 up to ₹5 crore turnover, 6 above).
- **Place of supply:**
  - It is set at checkout (default Gujarat) and decides CGST/SGST vs IGST.
  - For an unregistered buyer, the recorded address decides the place of supply (IGST s.10(1)(ca)). An out-of-state billing address is therefore refused unless the sale was priced for that state.
  - Over-the-counter sales to registered buyers from other states are a known grey area. **[VERIFY with accountant]**
- **Rounding:** each tax is calculated to the paisa (half-up). The bill total can be rounded to the nearest rupee with a visible round-off line.
- **Discounts** shown on the bill reduce the taxable value (s.15(3)(a)).
- **Corrections:** an issued document is never edited.
  - *Cancel* (goods not supplied; refund recorded first; the number is kept).
  - *Return → Credit Note* (references the original bill number and date; proportional tax; exact to the paisa on full return).
  - Credit notes must be declared within the s.34 time limit. Your accountant handles the returns filing.
- **E-invoicing (IRN)** applies above ₹5 crore turnover (B2B) and is **not implemented**. The B2C dynamic QR applies only above ₹500 crore.
- **GST rate classes:**
  - Seeded classes: 18%, 5% and 0%.
  - Believed rates: paints (3208/3209/3210), plastic tanks (3925), plastic pipes/fittings (3917), ceramic sanitaryware (6910) and taps/valves (8481) at 18%.
  - Verify every product's HSN and rate.
- **Customer share links:** each document gets an unguessable link (`/d/<token>`) that staff can revoke. It shows only that document.

---

## Reports

Every figure comes from saved records. Training data is always excluded.

| Measure | Definition |
|---|---|
| **Net sales (revenue)** | Taxable value of issued, non-cancelled bills − taxable value of credit notes, by issue date (IST). Excludes output GST. |
| **GST collected** | Tax on bills − tax on credit notes |
| **Collections** | Verified payments received − refunds, by verification date. **Cash flow, not revenue.** |
| **Gross profit** | Revenue − cost of goods sold, using the cost frozen on each sold line. Lines without a known cost are excluded, and the **cost coverage %** is shown. Not net profit: operating expenses are not recorded. |
| **Pending payments** | Agreed total − credit notes − (received − refunded), for finalised or billed sales |

Tabs:
- Overview (KPIs and sales by day)
- Products (qty, revenue, average price, discount %, gross profit and margin)
- Categories
- Staff
- Discounts (with approvers)
- Collections
- Profit (including below-cost / below-floor lines)
- Price changes

CSV export needs `reports.export`. Profit, costs and margins need `reports.profit` + `costs.view`. Integration tests check that report totals reconcile with the underlying documents and payments.

---

## Sample data & training mode

- `npm run seed:demo` loads **SAMPLE** products in every category. They are named "SAMPLE …", flagged `is_sample`, have placeholder prices and costs, and show a red **SAMPLE DATA** badge on the website, POS and dashboard.
- Any sale containing a sample product is a **training sale**:
  - It uses a separate `TRN/` numbering series.
  - Its documents are watermarked *"TRAINING / SAMPLE DATA — NOT A VALID BILL"*.
  - It is excluded from all reports and dashboards.
- Training sales work even before GST registration is configured, so staff can practise safely.
- A sale is either all-sample or all-real: the POS refuses to mix them, so real goods can never be hidden inside a training sale.
- Only the Super Admin can mark a product as sample data or remove that marking (including via CSV import).
- Before going live:
  1. Unpublish or deactivate the sample products (Products → filter "Sample").
  2. Enter real products with verified data.
  3. Confirm the tax settings.

---

## Security & audit

- **Passwords:**
  - scrypt hashing (N=2¹⁵), minimum length 10 (12 for the Super Admin).
  - Common passwords and passwords containing the username are rejected.
  - Temporary passwords must be changed at first sign-in.
  - Optional **secret key**: a second step after the password at every sign-in and for in-person approvals (see [Secret key](#secret-key-second-sign-in-step)).
- **Sessions:**
  - A random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie, which is `Secure` with the `__Host-` prefix in production.
  - Only a SHA-256 of the token is stored.
  - Sessions expire after inactivity and have a maximum age.
  - Password changes, resets, deactivation and role changes revoke sessions.
- **Lockout & rate limits:**
  - Account lockout after repeated wrong passwords, whether at sign-in or when a manager's password is typed for an in-person approval.
  - Rate limits stored in the database, so they work across instances, on: sign-in, in-person approvals (per device, per cashier and per approver account), enquiries and share links.
  - Client IPs are read from the trusted proxy hop of `X-Forwarded-For` (`TRUST_PROXY_HOPS`), so a forged header can't dodge the limits.
- **CSRF:** every state-changing API call must come from the same origin (Origin / Sec-Fetch-Site check) and be JSON; the cookie is SameSite.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS in production, and `noindex` on staff pages.
- **Validation:** zod schemas on every API input; parameterised SQL only.
- **Uploads:** images are decoded and re-encoded with sharp (WebP, max 1600px, metadata stripped), size-limited and content-addressed.
- **Data protection:**
  - Public endpoints return only explicitly built DTOs: no costs, margins, staff or internal data.
  - Cost and profit fields are stripped server-side for users without `costs.view`, including the per-line "below cost" flags and category margin targets. Their approval message says only "below the allowed minimum".
  - Staff without `sales.view_all` can only open, print, share or see payments of their own sales; shop-wide payment reports need report access.
  - A sales account the Super Admin has given extra powers (extra permissions or higher limits) can only be reset or reactivated by the Super Admin.
  - Enquiry IP addresses are stored only as keyed hashes.
- **Audit log** (append-only; Dashboard → Audit log) covers:
  - sign-ins and failures, user and permission changes;
  - product, price and cost changes, discount approvals, price overrides;
  - payment QR, confirmations, reversals and refunds;
  - bill issue, reprints, cancellations and credit notes;
  - settings changes (with before/after) and website orders.

---

## Testing

```bash
npm run test:unit          # pricing engine, money, GST/India helpers, roles, CSV, import file readers (no DB)
npm run test:ocr           # scanned files (English, Hindi, Gujarati) through the real text recognition engine (~3 minutes, no DB)
npm run test:integration   # real PostgreSQL in TEST_DATABASE_URL — rebuilt from migrations, then wiped
npm test                   # all three
npm run build && npm run test:e2e   # Playwright browser tests (desktop + mobile)
npm run typecheck && npm run lint
```

`test:e2e` rebuilds the separate `E2E_DATABASE_URL` database from migrations (with SAMPLE products, a test GSTIN and a test UPI ID), starts the production build on port 3200 and runs each spec on a desktop and a Pixel 7 profile:

| Spec | What it drives in a real browser |
|---|---|
| `admin-signin.spec.ts` | Owner at `/admin`: temporary password → forced change → add secret key → sign out → sign-in asks for the key after the password (wrong key refused, no session until it's right) |
| `auth-access.spec.ts` | Generic wrong-password message, sign-in redirect, forced password change, sales staff kept out of admin pages and APIs, cross-site POST refusal, security headers, owner admin pages |
| `public-site.spec.ts` | Homepage and WhatsApp contact, catalogue search with SAMPLE marking, product page warning, visitor order request visible to staff, invalid share link reveals nothing |
| `catalogue.spec.ts` | Product editor, price review, CSV import validation, cost/margin data never sent to an admin without cost access |
| `dashboard-ops.spec.ts` | Overview totals unchanged by training sales; sale → payment → document → PDF traceability |
| `pos.spec.ts` | **The acceptance scenario:** sales staff over-discounts → server blocks finalising → admin approves remotely → customer agrees → UPI QR (not treated as paid) → 12-digit UTR + explicit confirmation → GST tax invoice `OE/yy-yy/n` → PDF; 403 on price/cost edits; UTR reuse rejected; scanner-style SKU + Enter |

Last full run (18 Oct 2026, this repository): **51 unit, 72 integration and 34 browser tests passed.** Four browser tests that create accounts run on the desktop profile only, so they show as skipped on the mobile profile.

### Recorded walkthrough (videos)

```bash
npm run build && npm run walkthrough
```

This rebuilds the e2e database, then records a narrated video of every page and feature in the real app. The owner "Kishan" is created exactly as in the handover note, but with a demo password. The run covers sign-in, website, settings, staff, catalogue, price approval, import, the full counter sale, payments, returns, reports, audit log, access control, training mode and the phone layouts. Each video has captions and on-screen ✅/❌ checks. Results go to `walkthrough-output/`:

- `videos/*.mp4`: one file per video, plus extra files for a second device (for example the manager approving from another screen).
- `REPORT.md`: every check with its result, and the error for any that failed.

**Coverage of the required checks:**

| # | Requirement | Where |
|---|---|---|
| 1–3 | Super Admin / Admin / Sales permissions | `tests/integration/auth-rbac.test.ts`, `tests/unit/permissions-csv.test.ts` |
| 4 | Unauthorised users can't change master prices | `pricing-sales.test.ts` "unauthorised users cannot change master prices" |
| 5–6 | Exact variants; quantity & money maths | `tests/unit/pricing-engine.test.ts`, `pricing-sales.test.ts` |
| 7–8 | Discount limits; exceptional discounts need approval | `pricing-sales.test.ts` (limits, remote/in-person approval, cart-bound approvals, approver limits); `tests/e2e/pos.spec.ts` |
| 9 | Tax & rounding | `pricing-engine.test.ts` (inclusive/exclusive, CGST/SGST/IGST, cess, round-off) |
| 10 | Historical invoices unchanged by price/settings changes | `payments-billing.test.ts` |
| 11 | QR amount = finalised payable | `payments-billing.test.ts` |
| 12 | Unverified payments never marked paid | `payments-billing.test.ts`; `tests/e2e/pos.spec.ts` (QR shown ≠ paid; UTR + confirmation required) |
| 13 | Duplicate notifications don't duplicate payments | `payments-billing.test.ts` (webhook duplicate / retry / amount mismatch; reused UTR) |
| 14 | Customer validation | `payments-billing.test.ts` (GSTIN checksum, B2B details, ₹50,000 rule, place of supply), `tests/unit/india.test.ts` |
| 15 | Correct document types | `payments-billing.test.ts` (tax invoice, bill of supply for composition, training) |
| 16 | Unique numbering | `payments-billing.test.ts` (12 concurrent bills → gapless & unique) |
| 17 | Historical retrieval & printing | `payments-billing.test.ts` snapshot tests; PDF route; `dashboard-ops.spec.ts`, `pos.spec.ts` |
| 18 | Refunds/cancellations keep audit history | `payments-billing.test.ts` (cancel with refund, credit notes, audit entries; DB rejects deletes) |
| 19 | Reports reconcile with source records | `payments-billing.test.ts` "reports reconcile…" |
| 20 | Server-side protection of sensitive data | RBAC tests; cost stripping; `security-review.test.ts` (approval lockout, mixed training carts, UTR evidence, ownership checks, cost signals); `tests/e2e` forbidden pages |
| 21 | Mobile & desktop | `tests/e2e` runs on desktop and Pixel 7 profiles |
| 22 | Sample data separated | `payments-billing.test.ts` (training numbering, watermark, excluded from reports) |

---

## Deployment

### Option A — single server (recommended; low cost)

A small VPS (2 vCPU, 2–4 GB RAM) running Docker:

```bash
cp .env.production.example .env.production   # fill in strong secrets and your domain
docker compose --env-file .env.production up -d --build     # db → migrations → app → nightly backups
docker compose --env-file .env.production run --rm tools npm run create-super-admin
```

- **TLS:** put a reverse proxy with HTTPS in front of `127.0.0.1:3000`. Example Caddyfile: `omenterprise.in { reverse_proxy 127.0.0.1:3000 }`.
- **Uploads:** product images live in the `uploads` volume.
- **Updates:** `git pull && docker compose --env-file .env.production up -d --build`. Migrations run automatically through the `tools` service before the app starts.

### Option B — managed database + Node host
- **Database:** any managed PostgreSQL (Supabase, Neon, RDS…). Use `sslmode=require`.
  - With Supabase, use the direct or session-pooler connection string. The RLS lockdown keeps its public REST API from exposing tables.
- **App:** run `npm ci && npm run build && npm run db:migrate && npm start` on any Node 20+ host.
  - If you ship only the `.next/standalone` folder to another machine, note that Next.js copies the `.env` files present at build time into it. Build with production settings only, or delete `.next/standalone/.env` before copying. Docker builds never contain `.env` (see `.dockerignore`), and build tracing is configured to leave out backups, uploads, tests and scripts.
- **Image storage:** if the host's disk is ephemeral (most serverless platforms), set `UPLOAD_STORAGE=database` so product images are kept in PostgreSQL (`upload_objects` table, included in database backups). The storage functions are isolated in `src/server/services/uploads.ts`.

### Option C — Vercel + Neon (the current trial setup)

Live trial: **https://om-enterprise-naswadi.vercel.app** (Vercel project `om-enterprise`, deploys `main`). The free Hobby plan is for **non-commercial use**: before real billing, move to Vercel Pro or Option A.

1. Import the GitHub repository as a Vercel project (framework Next.js). `vercel.json` sets the build command to `npm run vercel-build`, which runs: migrations → owner account if missing → catalogue import (`--publish`) → `next build`.
2. **Storage → Create Database → Neon**, region **Singapore**, connected to **Production**. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (used for migrations).
3. Project settings: Node 22; Functions region `sin1` (next to the database); preview deployments off, so unmerged branches never touch the live database.
4. Environment variables (Production):

   | Variable | Value |
   |---|---|
   | `APP_SECRET` | ≥ 32 random characters (Sensitive) |
   | `APP_BASE_URL` | `https://om-enterprise-naswadi.vercel.app` |
   | `SA_USERNAME`, `SA_NAME` | `Kishan`, `Kishan Suthar` |
   | `SA_PASSWORD` | Temporary owner password, ≥ 12 characters (Sensitive). Used once, by the first deploy; must be changed at first sign-in. Delete it afterwards. |
   | `UPLOAD_STORAGE` | `database` (the default on Vercel anyway) |
   | `DB_POOL_MAX` | `5` |

Builds run in Washington (iad1) and talk to the database in Singapore, so the migrate/import steps take a few minutes. Pages are served from Singapore, next to the database.

**The trial database is for practice.** Bills issued there use up real numbers (`OE/26-27/00001`…) and can't be deleted. Before going live, create a fresh Neon database (or branch) so the numbering starts at 1.

**Go-live checklist:**
1. Super Admin created.
2. Staff created; temporary passwords changed.
3. Business details and **GSTIN** entered.
4. **GST registration type confirmed with the accountant.**
5. Document prefixes and terms agreed.
6. UPI ID configured, and a test ₹1 payment verified.
7. Sample products unpublished; real products imported and reviewed.
8. Backups verified, with an off-site copy.
9. HTTPS working.

---

## Backup & recovery

- **Automatic** (docker-compose `backup` service): a nightly `pg_dump` (custom format) plus an archive of uploaded images in `./backups`, kept 30 days.
- **Manual:** `DATABASE_URL=… scripts/backup.sh`.
- **Off-site:** copy `./backups` off the server daily (rclone to Google Drive / S3, or download). A backup on the same disk is not a backup.
- **Restore** (tested):
  1. Create an **empty** database.
  2. `DATABASE_URL=postgres://…/om_restore scripts/restore.sh backups/om-YYYYMMDD-HHMMSS.dump` (the script refuses non-empty targets).
  3. Verify counts, then point `DATABASE_URL` at it.
  4. Restore images with `tar -xzf backups/uploads-….tar.gz -C <UPLOAD_DIR>`.

  Integrity triggers are restored with the schema.
- **Test a restore at least monthly.**

---

## Known limitations

- **Payments:**
  - With a plain UPI ID, payment confirmation is manual by design. No legitimate API exists for it.
  - The Razorpay integration is untested against a live account.
  - Other gateways (Cashfree, PhonePe, Paytm) would need adapters, using the same provider interface.
- **GST:**
  - No e-invoice (IRN), e-way bill or GSTR-1 export.
  - Tax rates and rules must be confirmed by the accountant.
  - The over-the-counter inter-state B2B place-of-supply case is flagged for verification.
- **Inventory:** data model and basic stock movements only. Purchase orders, goods-received workflows and valuation reports are not built, and inventory is off by default.
- **Content Security Policy:** uses `'unsafe-inline'` for scripts (Next.js without nonces). A nonce-based CSP would force fully dynamic rendering; React's escaping is the primary XSS defence.
- **Images:** stored on local disk by default; use object storage on hosts with ephemeral disks.
- **Two-factor authentication** is not implemented. Recommended next for the Super Admin.
- **Cost privacy at the counter:** cashiers never receive cost figures, but by trying different discounts they can find the point where approval becomes necessary. Without a minimum margin, that point is the cost. Setting a minimum margin above 0% (Settings → Discounts) keeps the exact cost hidden.
- **Offline POS:** the POS needs network access to the server; there is no offline queue.
- **Operating expenses:** not recorded, so there is no net-profit or full cash-flow statement.
- **Out of scope for this release:** customer accounts, loyalty, automated WhatsApp/email notifications, accounting-software export and barcode-scanner hardware integration. The data model leaves room for them; the POS search already accepts barcodes typed or scanned as keyboard input.

---

## Decisions & external dependencies still needed

1. **GST registration type, GSTIN, HSN codes and tax rates**: confirmed by the shop's accountant, then entered in Settings.
2. **Real product data**: Berger, Umiya Gold and other catalogues and data sheets, with verified prices and purchase costs. Only sample data is included.
3. **Shop UPI ID** (merchant/business account preferred). Optionally a Razorpay (or other) gateway account with QR Codes activated and API/webhook keys.
4. **Discount policy:** limits for Sachin, Yash and Vikram Uncle, approval limits, and the minimum margin %.
5. **Document prefixes, terms & conditions, and bank details** to print.
6. **Hosting:** a server/VPS or managed PostgreSQL + Node host, a domain name, and an off-site backup destination.
7. **Approved homepage mockup.** None was available in the repository, so the website follows the brand brief (navy/white/gold, premium and clean). It can be adjusted to match the mockup when provided.
