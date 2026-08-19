-- Rizipt V2 — D1 schema
-- Fresh schema, no Base44 data model reused.

PRAGMA foreign_keys = ON;

-- Single-row company profile (id is always 1)
CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  legal_name TEXT,
  gstin TEXT,
  pan TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',
  logo_url TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  website TEXT,
  brand_color TEXT DEFAULT '#233A5E',
  quotation_prefix TEXT NOT NULL DEFAULT 'QUO',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  bill_prefix TEXT NOT NULL DEFAULT 'RCT',
  default_tax_rate REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  next_quotation_seq INTEGER NOT NULL DEFAULT 1,
  next_invoice_seq INTEGER NOT NULL DEFAULT 1,
  next_bill_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gstin TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  hsn_sac TEXT,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  price REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- QUOTATION: the root document in the chain
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  issue_date TEXT NOT NULL,
  valid_until TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  -- lifecycle status: draft -> sent -> converted (or rejected)
  status TEXT NOT NULL DEFAULT 'draft',
  -- approval is tracked independently of lifecycle status so it can be
  -- inspected/audited after conversion into an invoice
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  converted_to_invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- INVOICE: created directly, or converted from an approved quotation
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  quotation_id INTEGER REFERENCES quotations(id),
  source_type TEXT NOT NULL DEFAULT 'direct', -- direct | quotation
  issue_date TEXT NOT NULL,
  due_date TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  -- lifecycle: draft -> sent -> paid/partially_paid/overdue -> converted, or void
  status TEXT NOT NULL DEFAULT 'draft',
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  converted_to_bill_id INTEGER REFERENCES bills(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- BILL / RECEIPT: created directly, or converted from an approved invoice
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_id INTEGER REFERENCES invoices(id),
  source_type TEXT NOT NULL DEFAULT 'direct', -- direct | invoice
  issue_date TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash | card | upi | bank_transfer | cheque | other
  payment_reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'paid', -- paid | refunded | void
  approval_status TEXT NOT NULL DEFAULT 'approved', -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation ON invoices(quotation_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_invoice ON bills(invoice_id);

INSERT OR IGNORE INTO company_profile (id, name) VALUES (1, 'Your Company');
