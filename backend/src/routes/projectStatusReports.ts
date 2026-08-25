import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { nextDocNumber } from "../utils/docNumber";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";

export const projectStatusReports = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
projectStatusReports.use("*", requireAuth, requireActiveSubscription);

type StatusItem = {
  task_name: string;
  owner?: string;
  status?: string;
  completion?: number;
  due_date?: string;
  notes?: string;
};

function normalizeItems(raw: unknown): StatusItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it.task_name === "string" && it.task_name.trim())
    .map((it) => ({
      task_name: it.task_name,
      owner: it.owner || "",
      status: it.status || "in_progress",
      completion: Math.max(0, Math.min(100, Number(it.completion) || 0)),
      due_date: it.due_date || null,
      notes: it.notes || "",
    }));
}

function overallCompletion(items: StatusItem[]): number {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, it) => sum + (it.completion || 0), 0) / items.length);
}

function parseRow(row: any) {
  if (!row) return row;
  return { ...row, items: JSON.parse(row.items || "[]") };
}

projectStatusReports.get("/", async (c) => {
  const { accountId } = c.get("auth");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM project_status_reports WHERE account_id = ? ORDER BY created_at DESC"
  )
    .bind(accountId)
    .all();
  return c.json((results ?? []).map(parseRow));
});

projectStatusReports.get("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM project_status_reports WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!row) return c.json({ error: "Report not found" }, 404);
  return c.json(parseRow(row));
});

projectStatusReports.post("/", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, any>>(c.req.raw);
  if (!body.project_name || !body.issue_date) {
    return c.json({ error: "project_name and issue_date are required" }, 400);
  }

  const items = normalizeItems(body.items);
  const completion = overallCompletion(items);
  const docNumber = await nextDocNumber(c.env.DB, accountId, "status_report");

  const result = await c.env.DB.prepare(
    `INSERT INTO project_status_reports
      (account_id, doc_number, project_name, customer_id, issue_date, period_from, period_to,
       overall_status, overall_completion, summary, items, prepared_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      accountId,
      docNumber,
      body.project_name,
      body.customer_id ?? null,
      body.issue_date,
      body.period_from ?? null,
      body.period_to ?? null,
      body.overall_status || "on_track",
      completion,
      body.summary ?? null,
      JSON.stringify(items),
      body.prepared_by ?? null,
      body.status || "draft"
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM project_status_reports WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(parseRow(row), 201);
});

projectStatusReports.put("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const body = await parseBody<Record<string, any>>(c.req.raw);

  const existing = await c.env.DB.prepare("SELECT * FROM project_status_reports WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<any>();
  if (!existing) return c.json({ error: "Report not found" }, 404);

  const items = "items" in body ? normalizeItems(body.items) : JSON.parse(existing.items || "[]");
  const completion = overallCompletion(items);

  await c.env.DB.prepare(
    `UPDATE project_status_reports SET
      project_name = ?, customer_id = ?, issue_date = ?, period_from = ?, period_to = ?,
      overall_status = ?, overall_completion = ?, summary = ?, items = ?,
      prepared_by = ?, status = ?, updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      body.project_name ?? existing.project_name,
      body.customer_id ?? existing.customer_id,
      body.issue_date ?? existing.issue_date,
      body.period_from ?? existing.period_from,
      body.period_to ?? existing.period_to,
      body.overall_status ?? existing.overall_status,
      completion,
      body.summary ?? existing.summary,
      JSON.stringify(items),
      body.prepared_by ?? existing.prepared_by,
      body.status ?? existing.status,
      id,
      accountId
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM project_status_reports WHERE id = ?").bind(id).first();
  return c.json(parseRow(row));
});

projectStatusReports.delete("/:id", async (c) => {
  const { accountId } = c.get("auth");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM project_status_reports WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first();
  if (!existing) return c.json({ error: "Report not found" }, 404);
  await c.env.DB.prepare("DELETE FROM project_status_reports WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .run();
  return c.json({ ok: true });
});
