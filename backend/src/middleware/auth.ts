import { createMiddleware } from "hono/factory";
import type { Env, AuthContext } from "../types";
import { verifySession, sessionCookieName, parseCookies } from "../utils/session";

function isAdminEmail(email: string, adminEmailsCsv: string): boolean {
  const list = (adminEmailsCsv || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Requires a valid session cookie; attaches { userId, accountId, email, isAdmin } to context as "auth". */
export const requireAuth = createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext } }>(async (c, next) => {
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  const token = cookies[sessionCookieName()];
  if (!token) return c.json({ error: "Not signed in" }, 401);

  const session = await verifySession(token, c.env.SESSION_SECRET);
  if (!session) return c.json({ error: "Session expired — please sign in again" }, 401);

  c.set("auth", {
    userId: session.userId,
    accountId: session.accountId,
    email: session.email,
    isAdmin: isAdminEmail(session.email, c.env.ADMIN_EMAILS),
  });
  await next();
});

/**
 * Blocks write operations (POST/PUT/PATCH/DELETE) once an account's trial or
 * subscription has lapsed. Reads always stay available so nobody loses access
 * to data they already entered. Skips GET/HEAD, and skips the billing routes
 * themselves so a lapsed account can still submit a payment claim.
 */
export const requireActiveSubscription = createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext } }>(
  async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();

    const auth = c.get("auth");
    const account = await c.env.DB.prepare(
      "SELECT subscription_status, trial_ends_at, current_period_end, plan FROM accounts WHERE id = ?"
    )
      .bind(auth.accountId)
      .first<any>();

    if (!account) return c.json({ error: "Account not found" }, 404);

    const now = Date.now();
    const trialActive = account.trial_ends_at && new Date(account.trial_ends_at).getTime() > now;
    const periodActive = account.current_period_end && new Date(account.current_period_end).getTime() > now;
    const grandfathered = account.plan === "grandfathered";

    if (trialActive || periodActive || grandfathered) {
      return next();
    }

    return c.json(
      { error: "Your free trial has ended. Visit Subscription to renew and keep creating documents." },
      402
    );
  }
);
