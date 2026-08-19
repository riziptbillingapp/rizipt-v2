-- Migration 0004: multi-tenancy, accounts, Google auth users, subscriptions
--   npx wrangler d1 execute rizipt_v2 --file=./migrations/0004_accounts_auth_billing.sql --remote

-- One row per tenant/business. Existing single-tenant data becomes account id 1.
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'My Business',
  -- trialing | active | past_due | expired
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT,
  current_period_end TEXT,
  plan TEXT, -- monthly | yearly | null while trialing
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per signed-in person. A person belongs to exactly one account (owner or member).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'owner', -- owner | member
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- A UPI payment the user says they've made, awaiting manual approval by an admin.
CREATE TABLE IF NOT EXISTS payment_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  plan TEXT NOT NULL, -- monthly | yearly
  amount REAL NOT NULL,
  utr_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_claims_account ON payment_claims(account_id);

-- Seed account 1 from the existing single-tenant data, grandfathered in as active
-- (no trial countdown — this is your existing live business, not a new signup).
INSERT INTO accounts (id, name, subscription_status, plan)
SELECT 1, COALESCE((SELECT name FROM company_profile WHERE id = 1), 'My Business'), 'active', 'grandfathered'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = 1);

-- Scope every existing table to an account.
-- company_profile is rebuilt (not ALTERed) because its old CHECK(id = 1)
-- constraint forbade more than one row — multi-tenancy needs one row per account.
CREATE TABLE company_profile_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id),
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

INSERT INTO company_profile_new
SELECT id, 1, name, legal_name, gstin, pan, email, phone, address_line1, address_line2,
       city, state, pincode, country, logo_url, bank_name, bank_account_no, bank_ifsc,
       upi_id, website, quotation_prefix, invoice_prefix, bill_prefix, default_tax_rate,
       currency, next_quotation_seq, next_invoice_seq, next_bill_seq, updated_at
FROM company_profile;

DROP TABLE company_profile;
ALTER TABLE company_profile_new RENAME TO company_profile;

ALTER TABLE customers ADD COLUMN account_id INTEGER;
ALTER TABLE products ADD COLUMN account_id INTEGER;
ALTER TABLE quotations ADD COLUMN account_id INTEGER;
ALTER TABLE invoices ADD COLUMN account_id INTEGER;
ALTER TABLE bills ADD COLUMN account_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_company_profile_account ON company_profile(account_id);
CREATE INDEX IF NOT EXISTS idx_customers_account ON customers(account_id);
CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);
CREATE INDEX IF NOT EXISTS idx_quotations_account ON quotations(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_bills_account ON bills(account_id);

UPDATE customers SET account_id = 1 WHERE account_id IS NULL;
UPDATE products SET account_id = 1 WHERE account_id IS NULL;
UPDATE quotations SET account_id = 1 WHERE account_id IS NULL;
UPDATE invoices SET account_id = 1 WHERE account_id IS NULL;
UPDATE bills SET account_id = 1 WHERE account_id IS NULL;

-- The first person to sign in with the email in BOOTSTRAP_OWNER_EMAIL (see wrangler.toml)
-- gets linked to account 1 instead of a fresh account, in the auth callback route —
-- no DB action needed here, this is just documentation of that behavior.
