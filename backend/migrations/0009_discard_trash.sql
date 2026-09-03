-- Adds soft-delete ("move to trash") support to the three document tables.
-- discarded_at is NULL for normal/active documents. Setting it hides the
-- document from the default list views without touching any lineage
-- (converted_to_invoice_id / converted_to_bill_id / quotation_id /
-- invoice_id references are left completely intact), so discarding a
-- converted document never breaks the chain it's part of.

ALTER TABLE quotations ADD COLUMN discarded_at TEXT;
ALTER TABLE invoices ADD COLUMN discarded_at TEXT;
ALTER TABLE bills ADD COLUMN discarded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_quotations_discarded ON quotations(discarded_at);
CREATE INDEX IF NOT EXISTS idx_invoices_discarded ON invoices(discarded_at);
CREATE INDEX IF NOT EXISTS idx_bills_discarded ON bills(discarded_at);
