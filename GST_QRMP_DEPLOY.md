# GST QRMP filing route — deploy notes

Changed/new files
- backend/migrations/0011_gst_qrmp.sql (new tables)
- backend/src/routes/gstFiling.ts (new, mounted at /api/gst-filing)
- backend/src/index.ts (mount), backend/src/utils/gst.ts (B2C-large threshold 2.5 lakh)
- frontend/src/pages/GstFiling.jsx (new guided page), GstClassic.jsx (old page, /gst-filing/classic)
- frontend/src/api/client.js, frontend/src/App.jsx

Deploy
1. cd backend && npx wrangler d1 execute rizipt_v2 --file=./migrations/0011_gst_qrmp.sql --remote
2. cd backend && npx wrangler deploy
3. Build/deploy the frontend as you normally do.

Before first use: in Company Profile set GSTIN and GST state code (33).
For Jul-Sep 2026 (already filed on the portal): record the July and August IFF and the GSTR-1 ARN so the
tracker is complete. Recording an IFF as filed freezes its invoices so the quarterly GSTR-1 skips them in 4A/7.
