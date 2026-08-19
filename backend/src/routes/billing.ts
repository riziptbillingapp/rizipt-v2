import { Hono } from "hono";
import type { Env, AuthContext } from "../types";
import { parseBody } from "../utils/http";
import { requireAuth } from "../middleware/auth";

export const billing = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
billing.use("*", requireAuth);

// Adjust these to your actual pricing.
const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 499,
  yearly: 4999,
};

billing.get("/status", async (c) => {
  const { accountId } = c.get("auth");
  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(accountId).first<any>();
  if (!account) return c.json({ error: "Account not found" }, 404);

  const pendingClaim = await c.env.DB.prepare(
    "SELECT * FROM payment_claims WHERE account_id = ? AND status = 'pending' ORDER BY submitted_at DESC LIMIT 1"
  )
    .bind(accountId)
    .first();

  const now = Date.now();
  const trialEndsAt = account.trial_ends_at ? new Date(account.trial_ends_at).getTime() : null;
  const periodEnd = account.current_period_end ? new Date(account.current_period_end).getTime() : null;
  const daysLeft = (ts: number | null) => (ts ? Math.max(0, Math.ceil((ts - now) / (1000 * 60 * 60 * 24))) : null);

  return c.json({
    ...account,
    plan_amounts: PLAN_AMOUNTS,
    trial_days_left: trialEndsAt && trialEndsAt > now ? daysLeft(trialEndsAt) : 0,
    period_days_left: periodEnd && periodEnd > now ? daysLeft(periodEnd) : 0,
    is_active: account.plan === "grandfathered" || (trialEndsAt && trialEndsAt > now) || (periodEnd && periodEnd > now),
    pending_claim: pendingClaim ?? null,
  });
});

billing.post("/claim", async (c) => {
  const { accountId } = c.get("auth");
  const body = await parseBody<Record<string, unknown>>(c.req.raw);
  const plan = String(body.plan || "");
  if (!PLAN_AMOUNTS[plan]) return c.json({ error: "plan must be 'monthly' or 'yearly'" }, 400);

  const existingPending = await c.env.DB.prepare(
    "SELECT id FROM payment_claims WHERE account_id = ? AND status = 'pending'"
  )
    .bind(accountId)
    .first();
  if (existingPending) return c.json({ error: "You already have a pending payment claim awaiting review" }, 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO payment_claims (account_id, plan, amount, utr_reference, status)
     VALUES (?, ?, ?, ?, 'pending')`
  )
    .bind(accountId, plan, PLAN_AMOUNTS[plan], body.utr_reference ?? null)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM payment_claims WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();
  return c.json(row, 201);
});

// --- Admin review (gated by ADMIN_EMAILS) -----------------------------

function requireAdmin(c: any) {
  const auth = c.get("auth") as AuthContext;
  if (!auth.isAdmin) return c.json({ error: "Admin access required" }, 403);
  return null;
}

billing.get("/admin/claims", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;

  const { results } = await c.env.DB.prepare(
    `SELECT pc.*, a.name as account_name
     FROM payment_claims pc JOIN accounts a ON a.id = pc.account_id
     ORDER BY pc.submitted_at DESC LIMIT 200`
  ).all();
  return c.json(results ?? []);
});

billing.patch("/admin/claims/:id/approve", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;

  const id = c.req.param("id");
  const claim = await c.env.DB.prepare("SELECT * FROM payment_claims WHERE id = ?").bind(id).first<any>();
  if (!claim) return c.json({ error: "Claim not found" }, 404);
  if (claim.status !== "pending") return c.json({ error: "Claim already reviewed" }, 409);

  const days = claim.plan === "yearly" ? 365 : 30;
  const { email } = c.get("auth") as AuthContext;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE accounts SET subscription_status = 'active', plan = ?,
        current_period_end = datetime('now', '+${days} days') WHERE id = ?`
    ).bind(claim.plan, claim.account_id),
    c.env.DB.prepare(
      "UPDATE payment_claims SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?"
    ).bind(email, id),
  ]);

  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(claim.account_id).first();
  return c.json(account);
});

billing.patch("/admin/claims/:id/reject", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;

  const id = c.req.param("id");
  const { email } = c.get("auth") as AuthContext;
  await c.env.DB.prepare(
    "UPDATE payment_claims SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(email, id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM payment_claims WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "Claim not found" }, 404);
  return c.json(row);
});
