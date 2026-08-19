-- Migration 0007: products vs services
--   npx wrangler d1 execute rizipt_v2 --file=./migrations/0007_product_item_type.sql --remote

ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'product';
