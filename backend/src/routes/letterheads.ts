import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env, AuthContext } from "../types";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
app.use("*", requireAuth, requireActiveSubscription);

function uuid() {
  return crypto.randomUUID();
}

async function nextDocNumber(db: D1Database, accountId: number): Promise<string> {
  const year = new Date().getFullYear();

  await db
    .prepare(
      `INSERT INTO letterhead_counters (account_id, last_number)
       VALUES (?, 0)
       ON CONFLICT(account_id) DO NOTHING`
    )
    .bind(accountId)
    .run();

  const row = await db
    .prepare(
      `UPDATE letterhead_counters
       SET last_number = last_number + 1
       WHERE account_id = ?
       RETURNING last_number`
    )
    .bind(accountId)
    .first<{ last_number: number }>();

  if (!row) {
    throw new Error("Failed to generate letterhead document number");
  }

  const seq = String(row.last_number).padStart(4, "0");
  return `LH-${year}-${seq}`;
}

app.get("/", async (c) => {
  const { accountId } = c.get("auth");

  const { results } = await c.env.DB
    .prepare(
      `SELECT id, doc_number, doc_type, title, subject, doc_date,
              recipient_name, status, created_at, updated_at
       FROM letterheads
       WHERE account_id = ?
       ORDER BY created_at DESC`
    )
    .bind(accountId)
    .all();

  return c.json({ items: results ?? [] });
});

app.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");

  const item = await c.env.DB
    .prepare(`SELECT * FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();

  if (!item) return c.json({ error: "Not found" }, 404);

  return c.json(item);
});

app.post("/", async (c) => {
  const { accountId, userId } = c.get("auth");
  const body = await c.req.json();

  if (!body.title || !body.doc_date || !body.body_content) {
    return c.json(
      { error: "title, doc_date and body_content are required" },
      400
    );
  }

  const id = uuid();
  const docNumber = await nextDocNumber(c.env.DB, accountId);

  await c.env.DB
    .prepare(
      `INSERT INTO letterheads
        (id, account_id, doc_number, doc_type, title, subject, doc_date,
         recipient_name, recipient_address, body_content, prepared_by,
         status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      accountId,
      docNumber,
      body.doc_type || "general",
      body.title,
      body.subject || null,
      body.doc_date,
      body.recipient_name || null,
      body.recipient_address || null,
      body.body_content,
      body.prepared_by || null,
      body.status || "draft",
      userId
    )
    .run();

  return c.json({ id, doc_number: docNumber }, 201);
});

app.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await c.env.DB
    .prepare(`SELECT id FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();

  if (!existing) return c.json({ error: "Not found" }, 404);

  await c.env.DB
    .prepare(
      `UPDATE letterheads SET
        doc_type = ?, title = ?, subject = ?, doc_date = ?,
        recipient_name = ?, recipient_address = ?, body_content = ?,
        prepared_by = ?, status = ?, updated_at = datetime('now')
       WHERE id = ? AND account_id = ?`
    )
    .bind(
      body.doc_type || "general",
      body.title,
      body.subject || null,
      body.doc_date,
      body.recipient_name || null,
      body.recipient_address || null,
      body.body_content,
      body.prepared_by || null,
      body.status || "draft",
      id,
      accountId
    )
    .run();

  return c.json({ success: true });
});

app.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");

  await c.env.DB
    .prepare(`DELETE FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .run();

  return c.json({ success: true });
});

export default app;
