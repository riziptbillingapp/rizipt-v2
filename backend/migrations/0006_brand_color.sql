-- Migration 0006: configurable document theme color
--   npx wrangler d1 execute rizipt_v2 --file=./migrations/0006_brand_color.sql --remote

ALTER TABLE company_profile ADD COLUMN brand_color TEXT DEFAULT '#233A5E';
