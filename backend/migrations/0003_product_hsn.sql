-- Migration 0003: HSN/SAC on products
--   wrangler d1 execute rizipt_v2 --file=./migrations/0003_product_hsn.sql --remote

ALTER TABLE products ADD COLUMN hsn_sac TEXT;
