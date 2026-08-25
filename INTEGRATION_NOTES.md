# Integration Notes — Letterhead & Project Status Report modules

Drop-in files following your existing Rizipt V2 conventions (React/Vite/Tailwind
frontend, Hono/D1 backend, per-account multi-tenant scoping, native vector
jsPDF generation, atomic doc-number counters).

## 1. Database
```
wrangler d1 execute <YOUR_DB_NAME> --file=./backend/migration_add_letterhead_and_status_report.sql --remote
```
Run without `--remote` first against local D1 to sanity check, then `--remote`
against the production DB (ff303f78-3914-4d09-a2bb-2a21c05e368a).

## 2. Backend (Worker)
Copy into your Worker's `routes/` folder:
- `routes.letterheads.js` → `routes/letterheads.js`
- `routes.projectStatusReports.js` → `routes/projectStatusReports.js`

In your main Worker entry (wherever `app.route('/api/invoices', ...)` etc. live):
```js
import letterheadRoutes from './routes/letterheads.js';
import psrRoutes from './routes/projectStatusReports.js';

app.route('/api/letterheads', letterheadRoutes);
app.route('/api/project-status-reports', psrRoutes);
```
Adjust the `requireAuth` import path in both files to match your real auth
middleware file (the one that verifies the HMAC session cookie and sets
`accountId`/`userId` on context).

## 3. Frontend
Copy into `src/`:
- `api/newModules.js` — adjust the `request` import to your real `client.js` helper
- `pdf/generateLetterheadPdf.js`
- `pdf/generateProjectStatusReportPdf.js`
- `pages/LetterheadsListPage.jsx`
- `pages/LetterheadFormPage.jsx`
- `pages/ProjectStatusReportsListPage.jsx`
- `pages/ProjectStatusReportFormPage.jsx`

Both PDF generators expect a `company` object shaped like the one your
existing invoice/quotation PDF code already uses (`logo_base64`, `theme_color`,
`name`, `address`, `gstin`). They import `useCompanyProfile` — point that at
whatever hook/context already loads Company Profile for your other PDFs.

Both list pages import `jspdf-autotable` (Project Status Report only) — you
already have `jspdf` installed; add the autotable plugin if not already present:
```
npm install jspdf-autotable
```

## 4. Router
```jsx
<Route path="/letterheads" element={<LetterheadsListPage />} />
<Route path="/letterheads/new" element={<LetterheadFormPage />} />
<Route path="/letterheads/:id/edit" element={<LetterheadFormPage />} />

<Route path="/project-status-reports" element={<ProjectStatusReportsListPage />} />
<Route path="/project-status-reports/new" element={<ProjectStatusReportFormPage />} />
<Route path="/project-status-reports/:id/edit" element={<ProjectStatusReportFormPage />} />
```
Wrap these the same way your other protected routes are wrapped (e.g. inside
`<ProtectedRoute>`).

## 5. Sidebar
Add two entries next to your existing Quotations/Invoices/Bills links, e.g.:
```jsx
<SidebarLink to="/letterheads" icon={FileText} label="Letterheads" />
<SidebarLink to="/project-status-reports" icon={BarChart3} label="Status Reports" />
```
(Swap `SidebarLink`/icon names for whatever your actual sidebar component uses.)

## 6. Notes on "Edit/Delete for future requirements"
Both list pages already wire up working Edit and Delete buttons (not stubs —
they call the real PUT/DELETE routes), since the backend routes support them
now. If you'd rather ship Edit/Delete disabled for this first release, just
add `disabled` to those two buttons in both list pages — everything else
(Preview, Download, Create) works standalone.

## 7. What's intentionally NOT included
- Rich-text editor for Letterhead body content — currently a plain textarea;
  the PDF generator strips HTML tags either way, so swapping in a rich text
  editor later is a frontend-only change.
- Linking a Project Status Report to a specific Quotation/Invoice chain —
  these are treated as standalone documents (matching your ask), not part of
  the Quotation → Invoice → Bill lineage chain.
