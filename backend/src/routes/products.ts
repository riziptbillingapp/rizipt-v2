import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const products = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
products.use("*", requireAuth, requireActiveSubscription);

const EDITABLE_FIELDS = ["name", "sku", "item_type", "hsn_sac", "description", "unit", "price", "tax_rate"] as const;

function normalizeItemType(raw: unknown): "product" | "service" {
  return String(raw ?? "").trim().toLowerCase() === "service" ? "service" : "product";
}

products.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const search = c.req.query("search");
  const itemType = c.req.query("item_type"); // "product" | "service"
  let query = "SELECT * FROM products WHERE is_archived = 0 AND account_id = ?";
  const values: unknown[] = [accountId];
  if (search) {
    query += " AND (name LIKE ? OR sku LIKE ?)";
    const like = `%${search}%`;
    values.push(like, like);
  }
  if (itemType === "product" || itemType === "service") {
    query += " AND item_type = ?";
    values.push(itemType);
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
    `INSERT INTO products (account_id, name, sku, item_type, hsn_sac, description, unit, price, tax_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      body.name,
      body.sku ?? null,
      normalizeItemType(body.item_type),
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

// Bulk create-or-update from a parsed CSV. Matches existing rows by SKU (per
// account) — a row whose SKU already exists updates that product instead of
// creating a duplicate; rows without a SKU always create a new product.
products.post("/import", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<{ items?: unknown[] }>(c.req.raw);
  const items = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) return c.json({ error: "No rows to import" }, 400);
  if (items.length > 1000) {
    return c.json({ error: "Import is limited to 1000 rows at a time. Split your file and try again." }, 400);
  }

  const { results: existing } = await c.env.DB.prepare(
    "SELECT id, sku FROM products WHERE account_id = ? AND sku IS NOT NULL AND sku != ''"
  )
    .bind(accountId)
    .all();
  const skuToId = new Map<string, number>(
    (existing as any[]).map((r) => [String(r.sku).trim().toLowerCase(), r.id])
  );

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];
  const statements: ReturnType<typeof c.env.DB.prepare>[] = [];

  items.forEach((raw: any, idx: number) => {
    const name = String(raw?.name ?? "").trim();
    if (!name) {
      errors.push({ row: idx + 1, message: "Missing name — row skipped" });
      return;
    }

    const sku = raw?.sku ? String(raw.sku).trim() : null;
    const item_type = normalizeItemType(raw?.item_type);
    const hsn_sac = raw?.hsn_sac ? String(raw.hsn_sac).trim() : null;
    const description = raw?.description ? String(raw.description).trim() : null;
    const unit = raw?.unit ? String(raw.unit).trim() : "unit";
    const price = Number(raw?.price) || 0;
    const tax_rate = Number(raw?.tax_rate) || 0;

    const existingId = sku ? skuToId.get(sku.toLowerCase()) : undefined;

    if (existingId) {
      updated += 1;
      statements.push(
        c.env.DB.prepare(
          `UPDATE products SET name = ?, item_type = ?, hsn_sac = ?, description = ?, unit = ?, price = ?, tax_rate = ?, updated_at = datetime('now')
           WHERE id = ? AND account_id = ?`
        ).bind(name, item_type, hsn_sac, description, unit, price, tax_rate, existingId, accountId)
      );
    } else {
      created += 1;
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO products (account_id, name, sku, item_type, hsn_sac, description, unit, price, tax_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(accountId, name, sku, item_type, hsn_sac, description, unit, price, tax_rate)
      );
    }
  });

  // D1 batch calls are chunked conservatively to stay well under Worker limits.
  const CHUNK_SIZE = 50;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await c.env.DB.batch(statements.slice(i, i + CHUNK_SIZE));
  }

  return c.json({ total: items.length, created, updated, skipped: errors.length, errors });
});

products.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const f of EDITABLE_FIELDS) {
    if (f in body) {
      let value: unknown = body[f];
      if (f === "price" || f === "tax_rate") value = Number(value) || 0;
      if (f === "item_type") value = normalizeItemType(value);
      sets.push(`${f} = ?`);
      values.push(value);
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
