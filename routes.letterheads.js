// routes/letterheads.js
// Mount in your main Hono app the same way you mount quotations/invoices:
//   import letterheadRoutes from './routes/letterheads.js'
//   app.route('/api/letterheads', letterheadRoutes)
//
// Assumes existing middleware sets c.get('accountId') and c.get('userId')
// after verifying the HMAC session cookie (same as your other protected routes).
// Adjust the middleware import to match your actual file.

import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js'; // <-- adjust path to your real middleware

const app = new Hono();
app.use('*', requireAuth);

function uuid() {
  return crypto.randomUUID();
}

// Atomic doc number generation — same UPDATE...RETURNING pattern used
// elsewhere to avoid the read-then-write race condition on document numbers.
async function nextDocNumber(db, accountId) {
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
    .first();

  const seq = String(row.last_number).padStart(4, '0');
  return `LH-${year}-${seq}`;
}

// ---- List ----
app.get('/', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');

  const { results } = await db
    .prepare(
      `SELECT id, doc_number, doc_type, title, subject, doc_date,
              recipient_name, status, created_at, updated_at
       FROM letterheads
       WHERE account_id = ?
       ORDER BY created_at DESC`
    )
    .bind(accountId)
    .all();

  return c.json({ items: results });
});

// ---- Get one ----
app.get('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');

  const item = await db
    .prepare(`SELECT * FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();

  if (!item) return c.json({ error: 'Not found' }, 404);
  return c.json(item);
});

// ---- Create ----
app.post('/', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const userId = c.get('userId');
  const body = await c.req.json();

  if (!body.title || !body.doc_date || !body.body_content) {
    return c.json({ error: 'title, doc_date and body_content are required' }, 400);
  }

  const id = uuid();
  const docNumber = await nextDocNumber(db, accountId);

  await db
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
      body.doc_type || 'general',
      body.title,
      body.subject || null,
      body.doc_date,
      body.recipient_name || null,
      body.recipient_address || null,
      body.body_content,
      body.prepared_by || null,
      body.status || 'draft',
      userId
    )
    .run();

  return c.json({ id, doc_number: docNumber }, 201);
});

// ---- Update ----
app.put('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db
    .prepare(`SELECT id FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .prepare(
      `UPDATE letterheads SET
        doc_type = ?, title = ?, subject = ?, doc_date = ?,
        recipient_name = ?, recipient_address = ?, body_content = ?,
        prepared_by = ?, status = ?, updated_at = datetime('now')
       WHERE id = ? AND account_id = ?`
    )
    .bind(
      body.doc_type || 'general',
      body.title,
      body.subject || null,
      body.doc_date,
      body.recipient_name || null,
      body.recipient_address || null,
      body.body_content,
      body.prepared_by || null,
      body.status || 'draft',
      id,
      accountId
    )
    .run();

  return c.json({ success: true });
});

// ---- Delete ----
app.delete('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');

  await db
    .prepare(`DELETE FROM letterheads WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .run();

  return c.json({ success: true });
});

export default app;
