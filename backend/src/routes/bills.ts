import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { computeTotals, normalizeItems } from "../utils/totals";
import { nextDocNumber } from "../utils/docNumber";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const bills = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
bills.use("*", requireAuth, requireActiveSubscription);

function parseRow(row: any) {
  if (!row) return row;
  return { ...row, items: JSON.parse(row.items || "[]") };
}

bills.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const status = c.req.query("status");
  const customerId = c.req.query("customer_id");
  let query = "SELECT * FROM bills WHERE account_id = ?";
  const values: unknown[] = [accountId];
  if (status) {
    query += " AND status = ?";
    values.push(status);
  }
  if (customerId) {
    query += " AND customer_id = ?";
    values.push(customerId);
  }
  query += " ORDER BY created_at DESC";
  const { results } = await c.env.DB.prepare(query).bind(...values).all();
  return c.json((results ?? []).map(parseRow));
});

bills.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Bill not found" }, 404);
  return c.json(parseRow(row));
});

// Direct bill creation (walk-in sale, no source invoice)
bills.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.customer_id) return c.json({ error: "customer_id is required" }, 400);

  const items = normalizeItems(body.items);
  const totals = computeTotals(items);
  const docNumber = await nextDocNumber(c.env.DB, accountId, "bill");

  const result = await c.env.DB.prepare(
    `INSERT INTO bills
      (account_id, doc_number, customer_id, invoice_id, source_type, issue_date, items,
       subtotal, discount_total, tax_total, grand_total, payment_method, payment_reference,
       notes, status, approval_status)
     VALUES (?, ?, ?, NULL, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`
  )
    .bind(
      accountId,
      docNumber,
      body.customer_id,
      body.issue_date || new Date().toISOString().slice(0, 10),
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      body.payment_method || "cash",
      body.payment_reference ?? null,
      body.notes ?? null,
      body.status || "paid"
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(parseRow(row), 201);
});

bills.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const existing = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Bill not found" }, 404);

  const items = "items" in body ? normalizeItems(body.items) : JSON.parse(existing.items || "[]");
  const totals = computeTotals(items);

  await c.env.DB.prepare(
    `UPDATE bills SET
      customer_id = ?, issue_date = ?, items = ?,
      subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?,
      payment_method = ?, payment_reference = ?, notes = ?, status = ?, updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      body.customer_id ?? existing.customer_id,
      body.issue_date ?? existing.issue_date,
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      body.payment_method ?? existing.payment_method,
      body.payment_reference ?? existing.payment_reference,
      body.notes ?? existing.notes,
      body.status ?? existing.status,
      id,
      accountId
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(id).first();
  return c.json(parseRow(row));
});

bills.patch("/:id/void", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE bills SET status = 'void', updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Bill not found" }, 404);
  return c.json(parseRow(row));
});

bills.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM bills WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!existing) return c.json({ error: "Bill not found" }, 404);
  await c.env.DB.prepare("DELETE FROM bills WHERE id = ? AND account_id = ?").bind(id, accountId).run();
  return c.json({ ok: true });
});
