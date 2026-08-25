-- ============================================================
-- Migration: Add Letterhead (generic company documents, e.g. MoM)
--            and Project Status Report modules
-- Run with: wrangler d1 execute <DB_NAME> --file=./migration_add_letterhead_and_status_report.sql
-- Database ID (from project notes): ff303f78-3914-4d09-a2bb-2a21c05e368a
-- ============================================================

-- ------------------------------------------------------------
-- LETTERHEAD DOCUMENTS
-- Generic branded-letterhead document. Free-form body content,
-- so it can be used for Minutes of Meeting, general letters,
-- announcements, notices, etc. Reuses company profile branding
-- (logo, theme color, address) at render time — nothing about
-- branding is duplicated here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS letterheads (
  id TEXT PRIMARY KEY,                 -- uuid
  account_id INTEGER NOT NULL,            -- tenant scoping, matches pattern used elsewhere
  doc_number TEXT NOT NULL,            -- e.g. LH-2026-0001
  doc_type TEXT NOT NULL DEFAULT 'general', -- 'general' | 'mom' | 'notice' | 'other'
  title TEXT NOT NULL,                 -- e.g. "Minutes of Meeting - Aug Review"
  subject TEXT,
  doc_date TEXT NOT NULL,              -- ISO date
  recipient_name TEXT,
  recipient_address TEXT,
  body_content TEXT NOT NULL,          -- HTML from rich text editor (sanitized on save)
  prepared_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',-- 'draft' | 'final'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_letterheads_account ON letterheads(account_id);
CREATE INDEX IF NOT EXISTS idx_letterheads_doc_number ON letterheads(account_id, doc_number);

-- Per-tenant counter table reused for atomic doc numbering
-- (same UPDATE...RETURNING pattern already used for invoices/quotations
-- to avoid the read-then-write race condition documented earlier)
CREATE TABLE IF NOT EXISTS letterhead_counters (
  account_id INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- ------------------------------------------------------------
-- PROJECT STATUS REPORTS
-- Header + line items (milestones/tasks), each with its own
-- completion percentage. Overall completion is stored on the
-- header for fast list-view rendering, and is recomputed from
-- items whenever items change (see backend route logic).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_status_reports (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  doc_number TEXT NOT NULL,            -- e.g. PSR-2026-0001
  project_name TEXT NOT NULL,
  customer_id INTEGER,                    -- optional FK to existing customers table
  report_date TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  overall_status TEXT NOT NULL DEFAULT 'on_track', -- 'on_track' | 'at_risk' | 'delayed' | 'completed'
  overall_completion INTEGER NOT NULL DEFAULT 0,   -- 0-100, recomputed from items
  summary TEXT,
  prepared_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',-- 'draft' | 'final'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS project_status_report_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'not_started' | 'in_progress' | 'blocked' | 'done'
  completion INTEGER NOT NULL DEFAULT 0,       -- 0-100
  due_date TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (report_id) REFERENCES project_status_reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_psr_account ON project_status_reports(account_id);
CREATE INDEX IF NOT EXISTS idx_psr_doc_number ON project_status_reports(account_id, doc_number);
CREATE INDEX IF NOT EXISTS idx_psr_items_report ON project_status_report_items(report_id);

CREATE TABLE IF NOT EXISTS psr_counters (
  account_id INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

