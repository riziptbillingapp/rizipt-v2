import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env, AuthContext } from "../types";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

app.use("*", requireAuth);
app.use("*", requireActiveSubscription);

function uuid() {
  return crypto.randomUUID();
}

async function nextDocNumber(
  db: D1Database,
  accountId: number
): Promise<string> {
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
    .first<{ last_number: number }>();

  if (!row) {
    throw new Error("Failed to generate project status report number");
  }

  return `PSR-${year}-${String(row.last_number).padStart(4, "0")}`;
}

async function recomputeOverallCompletion(
  db: D1Database,
  reportId: string
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT completion
       FROM project_status_report_items
       WHERE report_id = ?`
    )
    .bind(reportId)
    .all<{ completion: number | null }>();

  if (!results || results.length === 0) {
    return 0;
  }

  const total = results.reduce(
    (sum: number, item: { completion: number | null }) =>
      sum + Number(item.completion || 0),
    0
  );

  const overall = Math.round(total / results.length);

  await db
    .prepare(
      `UPDATE project_status_reports
       SET overall_completion = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(overall, reportId)
    .run();

  return overall;
}

app.get("/", async (c) => {
  const { accountId } = c.get("auth");

  const { results } = await c.env.DB
    .prepare(
      `SELECT id, doc_number, project_name, customer_id, report_date,
              period_from, period_to, overall_status, overall_completion,
              summary, prepared_by, status, created_at, updated_at
       FROM project_status_reports
       WHERE account_id = ?
       ORDER BY report_date DESC, created_at DESC`
    )
    .bind(accountId)
    .all();

  return c.json({ items: results || [] });
});

app.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");

  const report = await c.env.DB
    .prepare(
      `SELECT *
       FROM project_status_reports
       WHERE id = ? AND account_id = ?`
    )
    .bind(id, accountId)
    .first();

  if (!report) {
    return c.json({ error: "Project status report not found" }, 404);
  }

  const { results: items } = await c.env.DB
    .prepare(
      `SELECT *
       FROM project_status_report_items
       WHERE report_id = ?
       ORDER BY sort_order ASC`
    )
    .bind(id)
    .all();

  return c.json({
    ...report,
    items: items || [],
  });
});

app.post("/", async (c) => {
  const { accountId, userId } = c.get("auth");
  const body = await c.req.json();

  if (!body.project_name || !body.report_date) {
    return c.json(
      {
        error: "project_name and report_date are required",
      },
      400
    );
  }

  const id = uuid();
  const docNumber = await nextDocNumber(c.env.DB, accountId);

  await c.env.DB
    .prepare(
      `INSERT INTO project_status_reports
       (
         id,
         account_id,
         doc_number,
         project_name,
         customer_id,
         report_date,
         period_from,
         period_to,
         overall_status,
         overall_completion,
         summary,
         prepared_by,
         status,
         created_by
       )
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
      body.overall_status || "on_track",
      0,
      body.summary || null,
      body.prepared_by || null,
      body.status || "draft",
      userId
    )
    .run();

  if (Array.isArray(body.items)) {
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];

      await c.env.DB
        .prepare(
          `INSERT INTO project_status_report_items
           (
             id,
             report_id,
             task_name,
             owner,
             status,
             completion,
             due_date,
             notes,
             sort_order
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          uuid(),
          id,
          item.task_name,
          item.owner || null,
          item.status || "in_progress",
          Number(item.completion || 0),
          item.due_date || null,
          item.notes || null,
          i
        )
        .run();
    }
  }

  const overallCompletion = await recomputeOverallCompletion(
    c.env.DB,
    id
  );

  return c.json(
    {
      id,
      doc_number: docNumber,
      overall_completion: overallCompletion,
    },
    201
  );
});

app.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await c.env.DB
    .prepare(
      `SELECT id
       FROM project_status_reports
       WHERE id = ? AND account_id = ?`
    )
    .bind(id, accountId)
    .first();

  if (!existing) {
    return c.json({ error: "Project status report not found" }, 404);
  }

  await c.env.DB
    .prepare(
      `UPDATE project_status_reports
       SET project_name = ?,
           customer_id = ?,
           report_date = ?,
           period_from = ?,
           period_to = ?,
           overall_status = ?,
           summary = ?,
           prepared_by = ?,
           status = ?,
           updated_at = datetime('now')
       WHERE id = ?
         AND account_id = ?`
    )
    .bind(
      body.project_name,
      body.customer_id || null,
      body.report_date,
      body.period_from || null,
      body.period_to || null,
      body.overall_status || "on_track",
      body.summary || null,
      body.prepared_by || null,
      body.status || "draft",
      id,
      accountId
    )
    .run();

  if (Array.isArray(body.items)) {
    await c.env.DB
      .prepare(
        `DELETE FROM project_status_report_items
         WHERE report_id = ?`
      )
      .bind(id)
      .run();

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];

      await c.env.DB
        .prepare(
          `INSERT INTO project_status_report_items
           (
             id,
             report_id,
             task_name,
             owner,
             status,
             completion,
             due_date,
             notes,
             sort_order
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          uuid(),
          id,
          item.task_name,
          item.owner || null,
          item.status || "in_progress",
          Number(item.completion || 0),
          item.due_date || null,
          item.notes || null,
          i
        )
        .run();
    }

    await recomputeOverallCompletion(c.env.DB, id);
  }

  return c.json({ success: true });
});

app.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");

  await c.env.DB
    .prepare(
      `DELETE FROM project_status_reports
       WHERE id = ? AND account_id = ?`
    )
    .bind(id, accountId)
    .run();

  return c.json({ success: true });
});

export default app;
