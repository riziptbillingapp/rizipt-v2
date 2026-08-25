# Integration Notes v2 — matches your actual rizipt-v2-main repo

This replaces the earlier delivery, which guessed at a plain-JS backend and
generic field names. These files were built directly against your uploaded
repo (TypeScript Hono backend, real company_profile schema, real client.js).
Drop each file at the exact path below, overwriting what's there.

## 1. Backend — copy these files in

```
backend/migrations/0008_letterheads_and_status_reports.sql   (new)
backend/src/utils/docNumber.ts                                (replace)
backend/src/routes/letterheads.ts                              (new)
backend/src/routes/projectStatusReports.ts                     (new)
backend/src/routes/company.ts                                  (replace)
backend/src/index.ts                                            (replace)
```

Then run the migration against production:
```
cd backend
wrangler d1 execute <YOUR_DB_NAME> --file=./migrations/0008_letterheads_and_status_reports.sql --remote
```
Deploy the Worker as usual (`wrangler deploy` / your existing script).

**What this adds to `company_profile`:** `letterhead_prefix`, `next_letterhead_seq`,
`psr_prefix`, `next_psr_seq` (reusing the exact same atomic counter pattern as
your quotation/invoice/bill numbering in `docNumber.ts`), plus `seal_url` and
`signature_url` alongside the existing `logo_url`.

## 2. Frontend — copy these files in

```
frontend/src/api/client.js                                     (replace)
frontend/src/utils/generateLetterheadPdf.js                     (new)
frontend/src/utils/generateProjectStatusReportPdf.js            (new)
frontend/src/pages/LetterheadsListPage.jsx                      (new)
frontend/src/pages/LetterheadFormPage.jsx                       (new)
frontend/src/pages/ProjectStatusReportsListPage.jsx              (new)
frontend/src/pages/ProjectStatusReportFormPage.jsx                (new)
frontend/src/pages/CompanyProfile.jsx                            (replace)
frontend/src/App.jsx                                              (replace)
frontend/src/components/Layout.jsx                                (replace)
```

Push to `main` to trigger the Pages auto-deploy.

## 3. What changed vs. the previous (incorrect) delivery

- **PDF field names now match `generateDocumentPdf.js` exactly** — `logo_url`,
  `address_line1/2`, `city`/`state`/`pincode`, `phone`, `email`, `website`,
  `gstin`, `pan`, `brand_color`. This is why the logo/address/phone/email/
  website weren't showing before: the old generator was guessing different
  field names (`logo_base64`, `city_state_pin`, `theme_color`, etc.) that
  don't exist in your schema — only `gstin` happened to match by coincidence.
- **Seal and Signature** are now real Company Profile fields (`seal_url`,
  `signature_url`), uploaded exactly like Logo (same compression pipeline via
  `fileToCompressedDataUrl`), and rendered in the signature block of both new
  PDF types — seal to the left, signature above the line, matching where a
  physical stamp+signature would go.
- **Letterhead and Status Report PDFs now share the same header design language**
  as your Quotations/Invoices/Bills (same brand color, same logo placement,
  same "For {company}" / "Authorised Signatory" footer pattern) instead of
  looking like a different, disconnected document type.
- **Backend is real TypeScript Hono routes**, not the plain-JS guesses from
  before — matches `requireAuth`/`requireActiveSubscription` middleware,
  `parseBody`, and the atomic `nextDocNumber` counter pattern used everywhere
  else in your app. The earlier JS route files (`routes.letterheads.js` etc.)
  should be deleted — they were never part of your actual Worker build.
- **`client.js`** now has the real `listLetterheads` / `createLetterhead` /
  etc. methods your pages actually call, alongside your existing methods —
  nothing else in the file was touched.

## 4. Cleanup

These files from the earlier delivery are now superseded and can be deleted
from wherever they were placed (repo root or elsewhere) since they don't match
your actual backend architecture:
`routes.letterheads.js`, `routes.projectStatusReports.js`, `newModules.js`,
`generateLetterheadPdf.js` (old JS version), `generateProjectStatusReportPdf.js`
(old JS version), `migration_add_letterhead_and_status_report.sql`,
`LetterheadsListPage.jsx` / `LetterheadFormPage.jsx` /
`ProjectStatusReportsListPage.jsx` / `ProjectStatusReportFormPage.jsx` (old
versions sitting outside `frontend/src/pages/`).

## 5. Quick post-deploy test

Once both backend and frontend are live:
1. Go to **Company Profile** → upload a Seal and Signature (new cards next to Logo).
2. Save.
3. Go to **Letterheads** → New → fill in a test MoM → Create.
4. Preview the PDF — logo, address, phone, email, website, GSTIN, PAN, brand
   color, and the seal + signature should all appear.
5. Repeat for **Status Reports**, including a couple of tasks with different
   completion percentages, to confirm the drawn completion bars render both
   on the list page and inside the PDF table.
