// routes/projectStatusReports.js
// Mount:
//   import psrRoutes from './routes/projectStatusReports.js'
//   app.route('/api/project-status-reports', psrRoutes)

import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js'; // <-- adjust path

const app = new Hono();
app.use('*', requireAuth);

function uuid() {
  return crypto.randomUUID();
}

async function nextDocNumber(db, accountId) {
  const year = new Date().getFullYear();

  await db
    .prepare(
      `INSERT INTO psr_counters (account_id, last_number)
       VALUES (?, 0)
       ON CONFLICT(account_id) DO NOTHING`
    )
    .bind(accountId)
    .run();

  const row = await db
    .prepare(
      `UPDATE psr_counters
       SET last_number = last_number + 1
       WHERE account_id = ?
       RETURNING last_number`
    )
    .bind(accountId)
    .first();

  const seq = String(row.last_number).padStart(4, '0');
  return `PSR-${year}-${seq}`;
}

// Recompute overall_completion as the average of item completions.
// Called any time items are written so the list view stays accurate
// without re-deriving it on every read.
async function recomputeOverallCompletion(db, reportId) {
  const { results } = await db
    .prepare(`SELECT completion FROM project_status_report_items WHERE report_id = ?`)
    .bind(reportId)
    .all();

  if (!results.length) return 0;
  const avg = Math.round(
    results.reduce((sum, r) => sum + (r.completion || 0), 0) / results.length
  );

  await db
    .prepare(
      `UPDATE project_status_reports SET overall_completion = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(avg, reportId)
    .run();

  return avg;
}

// ---- List ----
app.get('/', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');

  const { results } = await db
    .prepare(
      `SELECT id, doc_number, project_name, report_date, overall_status,
              overall_completion, status, created_at, updated_at
       FROM project_status_reports
       WHERE account_id = ?
       ORDER BY created_at DESC`
    )
    .bind(accountId)
    .all();

  return c.json({ items: results });
});

// ---- Get one (with items) ----
app.get('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');

  const report = await db
    .prepare(`SELECT * FROM project_status_reports WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();

  if (!report) return c.json({ error: 'Not found' }, 404);

  const { results: items } = await db
    .prepare(
      `SELECT * FROM project_status_report_items WHERE report_id = ? ORDER BY sort_order ASC`
    )
    .bind(id)
    .all();

  return c.json({ ...report, items });
});

// ---- Create (header + items in one call) ----
app.post('/', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const userId = c.get('userId');
  const body = await c.req.json();

  if (!body.project_name || !body.report_date) {
    return c.json({ error: 'project_name and report_date are required' }, 400);
  }

  const id = uuid();
  const docNumber = await nextDocNumber(db, accountId);
  const items = Array.isArray(body.items) ? body.items : [];

  await db
    .prepare(
      `INSERT INTO project_status_reports
        (id, account_id, doc_number, project_name, customer_id, report_date,
         period_from, period_to, overall_status, overall_completion, summary,
         prepared_by, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      accountId,
      docNumber,
      body.project_name,
      body.customer_id || null,
      body.report_date,
      body.period_from || null,
      body.period_to || null,
      body.overall_status || 'on_track',
      0,
      body.summary || null,
      body.prepared_by || null,
      body.status || 'draft',
      userId
    )
    .run();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db
      .prepare(
        `INSERT INTO project_status_report_items
          (id, report_id, task_name, owner, status, completion, due_date, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        uuid(),
        id,
        it.task_name,
        it.owner || null,
        it.status || 'in_progress',
        it.completion || 0,
        it.due_date || null,
        it.notes || null,
        i
      )
      .run();
  }

  const overall = await recomputeOverallCompletion(db, id);

  return c.json({ id, doc_number: docNumber, overall_completion: overall }, 201);
});

// ---- Update (header + full items replace, matches simple form UX) ----
app.put('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db
    .prepare(`SELECT id FROM project_status_reports WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .prepare(
      `UPDATE project_status_reports SET
        project_name = ?, customer_id = ?, report_date = ?, period_from = ?,
        period_to = ?, overall_status = ?, summary = ?, prepared_by = ?,
        status = ?, updated_at = datetime('now')
       WHERE id = ? AND account_id = ?`
    )
    .bind(
      body.project_name,
      body.customer_id || null,
      body.report_date,
      body.period_from || null,
      body.period_to || null,
      body.overall_status || 'on_track',
      body.summary || null,
      body.prepared_by || null,
      body.status || 'draft',
      id,
      accountId
    )
    .run();

  if (Array.isArray(body.items)) {
    await db.prepare(`DELETE FROM project_status_report_items WHERE report_id = ?`).bind(id).run();
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i];
      await db
        .prepare(
          `INSERT INTO project_status_report_items
            (id, report_id, task_name, owner, status, completion, due_date, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          uuid(),
          id,
          it.task_name,
          it.owner || null,
          it.status || 'in_progress',
          it.completion || 0,
          it.due_date || null,
          it.notes || null,
          i
        )
        .run();
    }
    await recomputeOverallCompletion(db, id);
  }

  return c.json({ success: true });
});

// ---- Delete ----
app.delete('/:id', async (c) => {
  const db = c.env.DB;
  const accountId = c.get('accountId');
  const id = c.req.param('id');

  await db
    .prepare(`DELETE FROM project_status_reports WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .run();
  // items cascade via ON DELETE CASCADE

  return c.json({ success: true });
});

export default app;
