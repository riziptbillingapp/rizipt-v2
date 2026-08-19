-- Migration 0005: resync document number counters
-- Fixes "UNIQUE constraint failed: quotations.doc_number" (and the equivalent
-- for invoices/bills) caused by next_*_seq drifting behind the highest
-- doc_number actually stored — e.g. from manual test inserts, or a counter
-- that got reset independently of the documents already created.
--
--   npx wrangler d1 execute rizipt_v2 --file=./migrations/0005_resync_doc_seq.sql --remote

UPDATE company_profile
SET next_quotation_seq = (
  SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
  FROM quotations
  WHERE quotations.account_id = company_profile.account_id
)
WHERE EXISTS (SELECT 1 FROM quotations WHERE quotations.account_id = company_profile.account_id)
  AND (
    SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
    FROM quotations
    WHERE quotations.account_id = company_profile.account_id
  ) > next_quotation_seq;

UPDATE company_profile
SET next_invoice_seq = (
  SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
  FROM invoices
  WHERE invoices.account_id = company_profile.account_id
)
WHERE EXISTS (SELECT 1 FROM invoices WHERE invoices.account_id = company_profile.account_id)
  AND (
    SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
    FROM invoices
    WHERE invoices.account_id = company_profile.account_id
  ) > next_invoice_seq;

UPDATE company_profile
SET next_bill_seq = (
  SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
  FROM bills
  WHERE bills.account_id = company_profile.account_id
)
WHERE EXISTS (SELECT 1 FROM bills WHERE bills.account_id = company_profile.account_id)
  AND (
    SELECT COALESCE(MAX(CAST(substr(doc_number, instr(doc_number, '-') + 1) AS INTEGER)), 0) + 1
    FROM bills
    WHERE bills.account_id = company_profile.account_id
  ) > next_bill_seq;
