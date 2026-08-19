import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const customers = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
customers.use("*", requireAuth, requireActiveSubscription);

customers.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const search = c.req.query("search");
  let query = "SELECT * FROM customers WHERE is_archived = 0 AND account_id = ?";
  const values: unknown[] = [accountId];
  if (search) {
    query += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)";
    const like = `%${search}%`;
    values.push(like, like, like);
  }
  query += " ORDER BY name ASC";
  const { results } = await c.env.DB.prepare(query).bind(...values).all();
  return c.json(results ?? []);
});

customers.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Customer not found" }, 404);
  return c.json(row);
});

customers.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const result = await c.env.DB.prepare(
    `INSERT INTO customers (account_id, name, email, phone, gstin, billing_address, shipping_address, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      body.name,
      body.email ?? null,
      body.phone ?? null,
      body.gstin ?? null,
      body.billing_address ?? null,
      body.shipping_address ?? null,
      body.notes ?? null
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(row, 201);
});

customers.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const fields = ["name", "email", "phone", "gstin", "billing_address", "shipping_address", "notes"];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const f of fields) {
    if (f in body) {
      sets.push(`${f} = ?`);
      values.push(body[f]);
    }
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);

  sets.push("updated_at = datetime('now')");
  values.push(id, accountId);
  await c.env.DB.prepare(`UPDATE customers SET ${sets.join(", ")} WHERE id = ? AND account_id = ?`)
    .bind(...values)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Customer not found" }, 404);
  return c.json(row);
});

customers.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE customers SET is_archived = 1, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  return c.json({ ok: true });
});
