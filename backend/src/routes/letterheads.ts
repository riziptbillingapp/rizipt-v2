import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { nextDocNumber } from "../utils/docNumber";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const letterheads = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
letterheads.use("*", requireAuth, requireActiveSubscription);

letterheads.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM letterheads WHERE account_id = ? ORDER BY created_at DESC"
  )
    .bind(accountId)
    .all();
  return c.json(results ?? []);
});

letterheads.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM letterheads WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Document not found" }, 404);
  return c.json(row);
});

letterheads.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  if (!body.title || !body.issue_date || !body.body_content) {
    return c.json({ error: "title, issue_date and body_content are required" }, 400);
  }

  const docNumber = await nextDocNumber(c.env.DB, accountId, "letterhead");

  const result = await c.env.DB.prepare(
    `INSERT INTO letterheads
      (account_id, doc_number, doc_type, title, subject, issue_date,
       recipient_name, recipient_address, body_content, prepared_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      docNumber,
      body.doc_type || "general",
      body.title,
      body.subject ?? null,
      body.issue_date,
      body.recipient_name ?? null,
      body.recipient_address ?? null,
      body.body_content,
      body.prepared_by ?? null,
      body.status || "draft"
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM letterheads WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(row, 201);
});

letterheads.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);

  const existing = await c.env.DB.prepare("SELECT * FROM letterheads WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Document not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE letterheads SET
      doc_type = ?, title = ?, subject = ?, issue_date = ?,
      recipient_name = ?, recipient_address = ?, body_content = ?,
      prepared_by = ?, status = ?, updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      body.doc_type ?? existing.doc_type,
      body.title ?? existing.title,
      body.subject ?? existing.subject,
      body.issue_date ?? existing.issue_date,
      body.recipient_name ?? existing.recipient_name,
      body.recipient_address ?? existing.recipient_address,
      body.body_content ?? existing.body_content,
      body.prepared_by ?? existing.prepared_by,
      body.status ?? existing.status,
      id,
      accountId
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM letterheads WHERE id = ?").bind(id).first();
  return c.json(row);
});

letterheads.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM letterheads WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!existing) return c.json({ error: "Document not found" }, 404);
  await c.env.DB.prepare("DELETE FROM letterheads WHERE id = ? AND account_id = ?").bind(id, accountId).run();
  return c.json({ ok: true });
});
