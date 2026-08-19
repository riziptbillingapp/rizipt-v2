import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const products = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
products.use("*", requireAuth, requireActiveSubscription);

products.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const search = c.req.query("search");
  let query = "SELECT * FROM products WHERE is_archived = 0 AND account_id = ?";
  const values: unknown[] = [accountId];
  if (search) {
    query += " AND (name LIKE ? OR sku LIKE ?)";
    const like = `%${search}%`;
    values.push(like, like);
  }
  query += " ORDER BY name ASC";
  const { results } = await c.env.DB.prepare(query).bind(...values).all();
  return c.json(results ?? []);
});

products.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Product not found" }, 404);
  return c.json(row);
});

products.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const result = await c.env.DB.prepare(
    `INSERT INTO products (account_id, name, sku, hsn_sac, description, unit, price, tax_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      body.name,
      body.sku ?? null,
      body.hsn_sac ?? null,
      body.description ?? null,
      body.unit ?? "unit",
      Number(body.price) || 0,
      Number(body.tax_rate) || 0
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(row, 201);
});

products.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const fields = ["name", "sku", "hsn_sac", "description", "unit", "price", "tax_rate"];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const f of fields) {
    if (f in body) {
      sets.push(`${f} = ?`);
      values.push(f === "price" || f === "tax_rate" ? Number(body[f]) || 0 : body[f]);
    }
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);

  sets.push("updated_at = datetime('now')");
  values.push(id, accountId);
  await c.env.DB.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ? AND account_id = ?`)
    .bind(...values)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Product not found" }, 404);
  return c.json(row);
});

products.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE products SET is_archived = 1, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  return c.json({ ok: true });
});
