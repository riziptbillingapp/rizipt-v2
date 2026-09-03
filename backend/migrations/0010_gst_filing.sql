-- Adds the fields GST return filing needs to correctly split CGST+SGST
-- (intra-state) vs IGST (inter-state), and to classify B2B vs B2C supplies.
--
-- state_code / gst_state_code are the 2-digit GST state codes (e.g. "33" for
-- Tamil Nadu) — the same codes that form the first two digits of any GSTIN.
-- place_of_supply is captured per document at creation time so a return for
-- a past month is never affected by a customer's address changing later.

ALTER TABLE company_profile ADD COLUMN gst_state_code TEXT;
ALTER TABLE customers ADD COLUMN state_code TEXT;
ALTER TABLE invoices ADD COLUMN place_of_supply TEXT;
ALTER TABLE bills ADD COLUMN place_of_supply TEXT;
