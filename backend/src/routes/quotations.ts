import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { computeTotals, normalizeItems } from "../utils/totals";
import { nextDocNumber } from "../utils/docNumber";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const quotations = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
quotations.use("*", requireAuth, requireActiveSubscription);

function parseRow(row: any) {
  if (!row) return row;
  return { ...row, items: JSON.parse(row.items || "[]") };
}

quotations.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const status = c.req.query("status");
  const customerId = c.req.query("customer_id");
  const trash = c.req.query("trash") === "1";
  let query = "SELECT * FROM quotations WHERE account_id = ?";
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

quotations.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Quotation not found" }, 404);
  return c.json(parseRow(row));
});

quotations.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.customer_id) return c.json({ error: "customer_id is required" }, 400);

  const items = normalizeItems(body.items);
  const totals = computeTotals(items);
  const docNumber = await nextDocNumber(c.env.DB, accountId, "quotation");

  const result = await c.env.DB.prepare(
    `INSERT INTO quotations
      (account_id, doc_number, customer_id, issue_date, valid_until, items, subtotal, discount_total, tax_total, grand_total, notes, terms, status, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      docNumber,
      body.customer_id,
      body.issue_date || new Date().toISOString().slice(0, 10),
      body.valid_until ?? null,
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      body.notes ?? null,
      body.terms ?? null,
      body.status || "draft",
      "pending"
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(parseRow(row), 201);
});

quotations.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const existing = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Quotation not found" }, 404);
  if (existing.status === "converted") {
    return c.json({ error: "Cannot edit a quotation that has already been converted to an invoice" }, 409);
  }

  const items = "items" in body ? normalizeItems(body.items) : JSON.parse(existing.items || "[]");
  const totals = computeTotals(items);
  // Editing line items invalidates any prior approval — the approved figures
  // wouldn't match the new totals/GST, so send it back for re-approval.
  const approvalStatus = "items" in body ? "pending" : existing.approval_status;

  await c.env.DB.prepare(
    `UPDATE quotations SET
      customer_id = ?, issue_date = ?, valid_until = ?, items = ?,
      subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?,
      notes = ?, terms = ?, status = ?, approval_status = ?, updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      body.customer_id ?? existing.customer_id,
      body.issue_date ?? existing.issue_date,
      body.valid_until ?? existing.valid_until,
      JSON.stringify(items),
      totals.subtotal,
      totals.discount_total,
      totals.tax_total,
      totals.grand_total,
      body.notes ?? existing.notes,
      body.terms ?? existing.terms,
      body.status ?? existing.status,
      approvalStatus,
      id,
      accountId
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ?").bind(id).first();
  return c.json(parseRow(row));
});

// --- Approval workflow -----------------------------------------------

quotations.patch("/:id/approve", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE quotations SET approval_status = 'approved', updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Quotation not found" }, 404);
  return c.json(parseRow(row));
});

quotations.patch("/:id/reject", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE quotations SET approval_status = 'rejected', status = 'rejected', updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Quotation not found" }, 404);
  return c.json(parseRow(row));
});

// --- Conversion: Quotation -> Invoice ---------------------------------

quotations.post("/:id/convert-to-invoice", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const quotation = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!quotation) return c.json({ error: "Quotation not found" }, 404);

  if (quotation.status === "converted") {
    return c.json({ error: "Quotation has already been converted to an invoice" }, 409);
  }
  if (quotation.approval_status !== "approved") {
    return c.json(
      { error: "Only an approved quotation can be converted to an invoice. Approve it first." },
      409
    );
  }

  const docNumber = await nextDocNumber(c.env.DB, accountId, "invoice");

  const result = await c.env.DB.prepare(
    `INSERT INTO invoices
      (account_id, doc_number, customer_id, quotation_id, source_type, issue_date, due_date, items,
       subtotal, discount_total, tax_total, grand_total, notes, terms, status, approval_status)
     VALUES (?, ?, ?, ?, 'quotation', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
  )
    .bind(
      accountId,
      docNumber,
      quotation.customer_id,
      quotation.id,
      body.issue_date || new Date().toISOString().slice(0, 10),
      body.due_date ?? null,
      quotation.items,
      quotation.subtotal,
      quotation.discount_total,
      quotation.tax_total,
      quotation.grand_total,
      quotation.notes,
      quotation.terms,
      // preserve the quotation's approval status onto the new invoice
      quotation.approval_status
    )
    .run();

  const invoiceId = result.meta.last_row_id;

  await c.env.DB.prepare(
    "UPDATE quotations SET status = 'converted', converted_to_invoice_id = ?, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(invoiceId, id, accountId)
    .run();

  const invoice = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(invoiceId).first();
  return c.json(parseRow(invoice), 201);
});

// --- Trash (soft delete) -----------------------------------------------
// Discarding just hides the document from the default list — it does not
// touch converted_to_invoice_id or any other lineage, so it's always safe,
// even for a converted or rejected quotation. Permanent deletion is only
// allowed once a document is already in the trash, as a safety rail against
// accidental data loss.

quotations.patch("/:id/discard", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE quotations SET discarded_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Quotation not found" }, 404);
  return c.json(parseRow(row));
});

quotations.patch("/:id/restore", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE quotations SET discarded_at = NULL, updated_at = datetime('now') WHERE id = ? AND account_id = ?"
  )
    .bind(id, accountId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Quotation not found" }, 404);
  return c.json(parseRow(row));
});

quotations.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT status, discarded_at FROM quotations WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Quotation not found" }, 404);
  if (!existing.discarded_at) {
    return c.json({ error: "Move this quotation to trash first, then delete it permanently from there" }, 409);
  }
  await c.env.DB.prepare("DELETE FROM quotations WHERE id = ? AND account_id = ?").bind(id, accountId).run();
  return c.json({ ok: true });
});
