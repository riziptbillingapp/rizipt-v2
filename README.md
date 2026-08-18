# Rizipt V2

A ground-up rebuild. No Base44 code, SDK, or architecture reused.

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Cloudflare Workers (Hono) + D1 (SQLite)

## Modules

- Company Profile
- Customers
- Products
- Quotations
- Invoices
- Bills / Receipts
- Billing History (unified ledger + document lineage viewer)

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

To deploy:

```bash
npm run db:init:remote                   # apply schema.sql to the remote D1 database
npm run deploy
```

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
| `company_profile` | Single-row business details + numbering prefixes/sequences          |
| `customers`        | Customer directory                                                   |
| `products`         | Product/service catalog with default price & tax rate               |
| `quotations`       | Root document; `approval_status` + `converted_to_invoice_id`         |
| `invoices`         | `quotation_id` links back if converted; `converted_to_bill_id` forward |
| `bills`            | `invoice_id` links back if converted; terminal document in the chain |
