-- Migration 0002: branding & payment fields
-- Run this against your EXISTING live database (rizipt.in). Do not re-run schema.sql
-- on a live DB — CREATE TABLE IF NOT EXISTS won't add columns to tables that already exist.
--
--   wrangler d1 execute rizipt_v2 --file=./migrations/0002_branding.sql --remote

ALTER TABLE company_profile ADD COLUMN upi_id TEXT;
ALTER TABLE company_profile ADD COLUMN website TEXT;
