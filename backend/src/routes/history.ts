import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { requireAuth } from "../middleware/auth";

export const history = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
history.use("*", requireAuth);

history.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const customerId = c.req.query("customer_id");
  const filter = customerId ? "WHERE account_id = ? AND customer_id = ?" : "WHERE account_id = ?";
  const binds = customerId ? [accountId, customerId] : [accountId];

  const [q, i, b] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, doc_number, customer_id, issue_date, grand_total, status, approval_status,
              converted_to_invoice_id, created_at
       FROM quotations ${filter} ORDER BY created_at DESC`
    ).bind(...binds).all(),
    c.env.DB.prepare(
      `SELECT id, doc_number, customer_id, issue_date, grand_total, status, approval_status,
              quotation_id, converted_to_bill_id, source_type, created_at
       FROM invoices ${filter} ORDER BY created_at DESC`
    ).bind(...binds).all(),
    c.env.DB.prepare(
      `SELECT id, doc_number, customer_id, issue_date, grand_total, status, approval_status,
              invoice_id, source_type, payment_method, created_at
       FROM bills ${filter} ORDER BY created_at DESC`
    ).bind(...binds).all(),
  ]);

  const customerIds = new Set<number>();
  for (const rows of [q.results, i.results, b.results]) {
    for (const r of rows ?? []) customerIds.add((r as any).customer_id);
  }

  let customerMap: Record<number, string> = {};
  if (customerIds.size > 0) {
    const placeholders = Array.from(customerIds).map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT id, name FROM customers WHERE account_id = ? AND id IN (${placeholders})`
    )
      .bind(accountId, ...Array.from(customerIds))
      .all();
    customerMap = Object.fromEntries((results ?? []).map((r: any) => [r.id, r.name]));
  }

  const entries = [
    ...(q.results ?? []).map((r: any) => ({
      doc_type: "quotation",
      ...r,
      customer_name: customerMap[r.customer_id] ?? null,
    })),
    ...(i.results ?? []).map((r: any) => ({
      doc_type: "invoice",
      ...r,
      customer_name: customerMap[r.customer_id] ?? null,
    })),
    ...(b.results ?? []).map((r: any) => ({
      doc_type: "bill",
      ...r,
      customer_name: customerMap[r.customer_id] ?? null,
    })),
  ].sort((a, b2) => String(b2.created_at).localeCompare(String(a.created_at)));

  return c.json(entries);
});

// Full lineage for a single document: quotation -> invoice -> bill
history.get("/chain/:type/:id", async (c) => {
  const { accountId } = c.get("auth");
  const type = c.req.param("type");
  const id = c.req.param("id");

  let quotation: any = null;
  let invoice: any = null;
  let bill: any = null;

  if (type === "quotation") {
    quotation = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
      .bind(id, accountId)
      .first();
    if (quotation?.converted_to_invoice_id) {
      invoice = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
        .bind(quotation.converted_to_invoice_id, accountId)
        .first();
    }
  } else if (type === "invoice") {
    invoice = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
      .bind(id, accountId)
      .first();
    if (invoice?.quotation_id) {
      quotation = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
        .bind(invoice.quotation_id, accountId)
        .first();
    }
  } else if (type === "bill") {
    bill = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ? AND account_id = ?")
      .bind(id, accountId)
      .first();
    if (bill?.invoice_id) {
      invoice = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND account_id = ?")
        .bind(bill.invoice_id, accountId)
        .first();
      if (invoice?.quotation_id) {
        quotation = await c.env.DB.prepare("SELECT * FROM quotations WHERE id = ? AND account_id = ?")
          .bind(invoice.quotation_id, accountId)
          .first();
      }
    }
  } else {
    return c.json({ error: "type must be one of quotation, invoice, bill" }, 400);
  }

  if (invoice?.converted_to_bill_id && !bill) {
    bill = await c.env.DB.prepare("SELECT * FROM bills WHERE id = ? AND account_id = ?")
      .bind(invoice.converted_to_bill_id, accountId)
      .first();
  }

  const parse = (row: any) => (row ? { ...row, items: JSON.parse(row.items || "[]") } : null);

  return c.json({
    quotation: parse(quotation),
    invoice: parse(invoice),
    bill: parse(bill),
  });
});
