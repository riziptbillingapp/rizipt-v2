import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const company = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
company.use("*", requireAuth, requireActiveSubscription);

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
  "seal_url",
  "signature_url",
  "bank_name",
  "bank_account_no",
  "bank_ifsc",
  "upi_id",
  "website",
  "brand_color",
  "quotation_prefix",
  "invoice_prefix",
  "bill_prefix",
  "letterhead_prefix",
  "psr_prefix",
  "default_tax_rate",
  "currency",
] as const;

async function getOrCreateProfile(db: any, accountId: number) {
  let row = await db.prepare("SELECT * FROM company_profile WHERE account_id = ?").bind(accountId).first();
  if (!row) {
    await db.prepare("INSERT INTO company_profile (account_id) VALUES (?)").bind(accountId).run();
    row = await db.prepare("SELECT * FROM company_profile WHERE account_id = ?").bind(accountId).first();
  }
  return row;
}

company.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const row = await getOrCreateProfile(c.env.DB, accountId);
  return c.json(row ?? {});
});

company.put("/", async (c) => {
  const { accountId } = c.get("auth");
  await getOrCreateProfile(c.env.DB, accountId);
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      sets.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    values.push(accountId);
    await c.env.DB.prepare(`UPDATE company_profile SET ${sets.join(", ")} WHERE account_id = ?`)
      .bind(...values)
      .run();
  }

  const row = await c.env.DB.prepare("SELECT * FROM company_profile WHERE account_id = ?").bind(accountId).first();
  return c.json(row ?? {});
});
