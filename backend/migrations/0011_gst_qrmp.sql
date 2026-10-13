-- QRMP (quarterly) GST filing support.
--
-- Periods: monthly records use "YYYY-MM"; quarterly records use "FY-Qn",
-- where FY is the starting year of the financial year (e.g. "2026-Q2" =
-- Jul-Sep 2026, FY 2026-27).

-- Per-invoice override of the default rule "an invoice counts for GST once it
-- has been converted to a Bill/Receipt".
CREATE TABLE IF NOT EXISTS gst_invoice_overrides (
  account_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('include', 'exclude')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, invoice_id)
);

-- Filing tracker: one row per return actually filed on the GST portal.
-- return_type: IFF (period YYYY-MM), GSTR1 (period FY-Qn), GSTR3B (period FY-Qn)
CREATE TABLE IF NOT EXISTS gst_filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  return_type TEXT NOT NULL CHECK (return_type IN ('IFF', 'GSTR1', 'GSTR3B')),
  period TEXT NOT NULL,
  arn TEXT,
  filed_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, return_type, period)
);

-- Documents that were furnished through an IFF, frozen when the IFF is marked
-- filed. The quarterly GSTR-1 skips these in tables 4A / 7 (they are still in
-- the HSN summary).
CREATE TABLE IF NOT EXISTS gst_iff_documents (
  account_id INTEGER NOT NULL,
  period TEXT NOT NULL,          -- YYYY-MM of the IFF
  doc_type TEXT NOT NULL,        -- invoice | bill
  doc_id INTEGER NOT NULL,
  PRIMARY KEY (account_id, doc_type, doc_id)
);

-- Monthly tax payments (PMT-06 challans) and any other cash deposits.
CREATE TABLE IF NOT EXISTS gst_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  quarter TEXT NOT NULL,         -- FY-Qn it is credited against
  paid_on TEXT,
  igst REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  reference TEXT,                -- CPIN / CIN / note
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual GSTR-3B inputs that Rizipt cannot know (ITC from GSTR-2B, interest,
-- late fee, opening cash ledger balance not captured in payments).
CREATE TABLE IF NOT EXISTS gst_3b_inputs (
  account_id INTEGER NOT NULL,
  quarter TEXT NOT NULL,
  itc_igst REAL NOT NULL DEFAULT 0,
  itc_cgst REAL NOT NULL DEFAULT 0,
  itc_sgst REAL NOT NULL DEFAULT 0,
  interest REAL NOT NULL DEFAULT 0,
  late_fee REAL NOT NULL DEFAULT 0,
  notes TEXT,
  PRIMARY KEY (account_id, quarter)
);
