import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { computeTotals, normalizeItems } from "../utils/totals";
import { nextDocNumber } from "../utils/docNumber";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const invoices = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
invoices.use("*", requireAuth, requireActiveSubscription);

function parseRow(row: any) {
  if (!row) return row;
  return { ...row, items: JSON.parse(row.items || "[]") };
}

invoices.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const status = c.req.query("status");
  const customerId = c.req.query("customer_id");
  const trash = c.req.query("trash") === "1";
  let query = "SELECT * FROM invoices WHERE account_id = ?";
  const values: unknown[] = [accountId];
  query += trash ? " AND discarded_at IS NOT NULL" : " AND discarded_at IS NULL";
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

invoices.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Invoice not found" }, 404);
  return c.json(parseRow(row));
});

// Direct invoice creation (no source quotation)
invoices.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.customer_id) return c.json({ error: "customer_id is required" }, 400);

  const items = normalizeItems(body.items);
  const totals = computeTotals(items);
  const docNumber = await nextDocNumber(c.env.DB, accountId, "invoice");

  let placeOfSupply = (body.place_of_supply as string) || null;
  if (!placeOfSupply) {
    const customer = await c.env.DB.prepare("SELECT state_code FROM customers WHERE id = ? AND account_id = ?")
      .bind(body.customer_id, accountId)
      .first<{ state_code: string | null }>();
    placeOfSupply = customer?.state_code || null;
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO invoices
      (account_id, doc_number, customer_id, quotation_id, source_type, issue_date, due_date, items,
       subtotal, discount_total, tax_total, grand_total, amount_paid, notes, terms, status, approval_status, place_of_supply)
     VALUES (?, ?, ?, NULL, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      docNumber,
      body.customer_id,
      body.issue_date || new Date().toISOString().slice(0, 10),
      body.due_date ?? null,
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      Number(body.amount_paid) || 0,
      body.notes ?? null,
      body.terms ?? null,
      body.status || "draft",
      "pending",
      placeOfSupply
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(parseRow(row), 201);
});

invoices.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const existing = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Invoice not found" }, 404);
  if (existing.status === "converted") {
    return c.json({ error: "Cannot edit an invoice that has already been converted to a bill" }, 409);
  }

  const items = "items" in body ? normalizeItems(body.items) : JSON.parse(existing.items || "[]");
  const totals = computeTotals(items);
  const approvalStatus = "items" in body ? "pending" : existing.approval_status;

  await c.env.DB.prepare(
    `UPDATE invoices SET
      customer_id = ?, issue_date = ?, due_date = ?, items = ?,
      subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?,
      amount_paid = ?, notes = ?, terms = ?, status = ?, approval_status = ?, place_of_supply = ?, updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      body.customer_id ?? existing.customer_id,
      body.issue_date ?? existing.issue_date,
      body.due_date ?? existing.due_date,
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      body.amount_paid ?? existing.amount_paid,
      body.notes ?? existing.notes,
      body.terms ?? existing.terms,
      body.status ?? existing.status,
      approvalStatus,
      body.place_of_supply ?? existing.place_of_supply,
      id,
      accountId
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first();
  return c.json(parseRow(row));
});

// --- Approval workflow -----------------------------------------------

invoices.patch("/:id/approve", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE invoices SET approval_status = 'approved', updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Invoice not found" }, 404);
  return c.json(parseRow(row));
});

invoices.patch("/:id/reject", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE invoices SET approval_status = 'rejected', updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Invoice not found" }, 404);
  return c.json(parseRow(row));
});

// --- Conversion: Invoice -> Bill/Receipt ------------------------------

invoices.post("/:id/convert-to-bill", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const invoice = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  if (invoice.status === "converted") {
    return c.json({ error: "Invoice has already been converted to a bill" }, 409);
  }
  if (invoice.approval_status !== "approved") {
    return c.json(
      { error: "Only an approved invoice can be converted to a bill/receipt. Approve it first." },
      409
    );
  }

  const docNumber = await nextDocNumber(c.env.DB, accountId, "bill");

  const result = await c.env.DB.prepare(
    `INSERT INTO bills
      (account_id, doc_number, customer_id, invoice_id, source_type, issue_date, items,
       subtotal, discount_total, tax_total, grand_total, payment_method, payment_reference,
       notes, status, approval_status, place_of_supply)
     VALUES (?, ?, ?, ?, 'invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`
  )
    .bind(
      accountId,
      docNumber,
      invoice.customer_id,
      invoice.id,
      body.issue_date || new Date().toISOString().slice(0, 10),
      invoice.items,
      invoice.subtotal,
      invoice.discount_total,
      invoice.tax_total,
      invoice.grand_total,
      body.payment_method || "cash",
      body.payment_reference ?? null,
      invoice.notes,
      // preserve the invoice's approval status onto the new bill
      invoice.approval_status,
      invoice.place_of_supply
    )
    .run();

  const billId = result.meta.last_row_id;

  await c.env.DB.prepare(
    "UPDATE invoices SET status = 'converted', converted_to_bill_id = ?, amount_paid = grand_total, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(billId, id, accountId)
    .run();

  const bill = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(billId).first();
  return c.json(parseRow(bill), 201);
});

// --- Trash (soft delete) -----------------------------------------------
// Discarding just hides the document from the default list — it does not
// touch converted_to_bill_id or any other lineage, so it's always safe,
// even for a converted, rejected, or unpaid invoice. Permanent deletion is
// only allowed once a document is already in the trash, as a safety rail
// against accidental data loss.

invoices.patch("/:id/discard", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE invoices SET discarded_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Invoice not found" }, 404);
  return c.json(parseRow(row));
});

invoices.patch("/:id/restore", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE invoices SET discarded_at = NULL, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Invoice not found" }, 404);
  return c.json(parseRow(row));
});

invoices.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT status, discarded_at FROM invoices WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Invoice not found" }, 404);
  if (!existing.discarded_at) {
    return c.json({ error: "Move this invoice to trash first, then delete it permanently from there" }, 409);
  }
  await c.env.DB.prepare("DELETE FROM invoices WHERE id = ? AND account_id = ?").bind(id, accountId).run();
  return c.json({ ok: true });
});
