import { Hono } from "hono";
import type { Env } from "../types";
import { parseBody } from "../utils/http";

export const company = new Hono<{ Bindings: Env }>();

const EDITABLE_FIELDS = [
  "name",
  "legal_name",
  "gstin",
  "pan",
  "email",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "pincode",
  "country",
  "logo_url",
  "bank_name",
  "bank_account_no",
  "bank_ifsc",
  "upi_id",
  "website",
  "quotation_prefix",
  "invoice_prefix",
  "bill_prefix",
  "default_tax_rate",
  "currency",
] as const;

company.get("/", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM company_profile WHERE id = 1").first();
  return c.json(row ?? {});
});

company.put("/", async (c) => {
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      sets.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (sets.length === 0) {
    const row = await c.env.DB.prepare("SELECT * FROM company_profile WHERE id = 1").first();
    return c.json(row ?? {});
  }

  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE company_profile SET ${sets.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM company_profile WHERE id = 1").first();
  return c.json(row ?? {});
});
