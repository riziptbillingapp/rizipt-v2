# Rizipt V2

A ground-up rebuild. No Base44 code, SDK, or architecture reused.

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Cloudflare Workers (Hono) + D1 (SQLite)

## Modules

- Company Profile (with logo upload, UPI ID, and a live payment QR preview)
- Customers
- Products (with HSN/SAC codes)
- Quotations
- Invoices
- Bills / Receipts
- Billing History (unified ledger + document lineage viewer)

Every Quotation, Invoice, and Bill has a **Preview / Download PDF** action that renders a printable A4
document (logo, itemized GST table with HSN/SAC, discount %, tax %, round-off, bank details, and a
scannable UPI QR code) and exports it client-side as a real PDF.

## Document conversion

```
Quotation ──(approve, then convert)──▶ Invoice ──(approve, then convert)──▶ Bill / Receipt
```

- A quotation must have `approval_status = 'approved'` before it can convert to an invoice.
- An invoice must have `approval_status = 'approved'` before it can convert to a bill/receipt.
- Converting copies the line items and totals onto the new document and **carries the approval status
  forward** onto it, while the source document is marked `status = 'converted'` and becomes read-only
  (it keeps a `converted_to_*_id` pointer, and the new document keeps a `quotation_id` / `invoice_id`
  pointer back). Nothing is deleted — the full chain stays inspectable from Billing History.
- Invoices and bills can also be created directly (`source_type = 'direct'`) without a source document,
  for walk-in sales that skip the quotation stage.

## Backend setup

```bash
cd backend
npm install
npx wrangler d1 create rizipt_v2        # copy the returned database_id into wrangler.toml
npm run db:init:local                    # seed schema for local dev
npm run dev                              # runs at http://localhost:8787
```

To deploy fresh:

```bash
npm run db:init:remote                   # apply schema.sql to the remote D1 database
npm run deploy
```

### Upgrading an already-deployed database

If you deployed before the branding/PDF update, `schema.sql` alone won't touch your existing tables
(`CREATE TABLE IF NOT EXISTS` skips tables that already exist). Apply these migrations instead:

```bash
npx wrangler d1 execute rizipt_v2 --file=./migrations/0002_branding.sql --remote
npx wrangler d1 execute rizipt_v2 --file=./migrations/0003_product_hsn.sql --remote
npm run deploy
```

`0002_branding.sql` adds `upi_id` and `website` to `company_profile`.
`0003_product_hsn.sql` adds `hsn_sac` to `products`.

Note: line-item discounts changed from a flat amount to a percentage (`discount_percent`) to match
standard GST document formatting. Any quotations/invoices/bills created before this change will still
open, but their stored discount values will be interpreted as a percentage going forward.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env                     # point VITE_API_URL at your Worker
npm run dev                               # runs at http://localhost:5173
```

## Data model summary

| Table            | Purpose                                                             |
|-------------------|----------------------------------------------------------------------|
| `company_profile` | Business details, logo, bank/UPI details, numbering prefixes/sequences |
| `customers`        | Customer directory                                                   |
| `products`         | Product/service catalog with HSN/SAC, default price & tax rate       |
| `quotations`       | Root document; `approval_status` + `converted_to_invoice_id`         |
| `invoices`         | `quotation_id` links back if converted; `converted_to_bill_id` forward |
| `bills`            | `invoice_id` links back if converted; terminal document in the chain |
