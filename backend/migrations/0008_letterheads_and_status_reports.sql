-- 0008_letterheads_and_status_reports.sql
-- Run against production with:
--   wrangler d1 execute <YOUR_DB_NAME> --file=./migrations/0008_letterheads_and_status_reports.sql --remote

-- Reuse the same "prefix + next_seq" counter pattern already on company_profile
-- (used by docNumber.ts / nextDocNumber) for the two new document kinds, plus
-- seal/signature branding fields alongside the existing logo_url.
ALTER TABLE company_profile ADD COLUMN letterhead_prefix TEXT NOT NULL DEFAULT 'LH';
ALTER TABLE company_profile ADD COLUMN next_letterhead_seq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_profile ADD COLUMN psr_prefix TEXT NOT NULL DEFAULT 'PSR';
ALTER TABLE company_profile ADD COLUMN next_psr_seq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_profile ADD COLUMN seal_url TEXT;
ALTER TABLE company_profile ADD COLUMN signature_url TEXT;

CREATE TABLE IF NOT EXISTS letterheads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  doc_number TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'general', -- 'general' | 'mom' | 'notice' | 'other'
  title TEXT NOT NULL,
  subject TEXT,
  issue_date TEXT NOT NULL,
  recipient_name TEXT,
  recipient_address TEXT,
  body_content TEXT NOT NULL,
  prepared_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'final'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_letterheads_account ON letterheads(account_id);

CREATE TABLE IF NOT EXISTS project_status_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  doc_number TEXT NOT NULL,
  project_name TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  issue_date TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  overall_status TEXT NOT NULL DEFAULT 'on_track', -- 'on_track' | 'at_risk' | 'delayed' | 'completed'
  overall_completion INTEGER NOT NULL DEFAULT 0,   -- 0-100, recomputed from items on write
  summary TEXT,
  items TEXT NOT NULL DEFAULT '[]',                -- JSON array, same pattern as bills.items
  prepared_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',             -- 'draft' | 'final'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_psr_account ON project_status_reports(account_id);
