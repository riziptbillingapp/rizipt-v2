import { Hono } from "hono";
import type { Env } from "../types";
import { buildGoogleAuthorizeUrl, exchangeCodeForTokens, verifyGoogleIdToken } from "../utils/googleAuth";
import { signSession, verifySession, sessionCookieName, sessionTtlSeconds, parseCookies } from "../utils/session";

export const auth = new Hono<{ Bindings: Env }>();

function isAdminEmail(email: string, adminEmailsCsv: string): boolean {
  const list = (adminEmailsCsv || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

function setCookie(headers: Headers, name: string, value: string, maxAgeSeconds: number) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAgeSeconds}`,
  ];
  headers.append("Set-Cookie", attrs.join("; "));
}

function clearCookie(headers: Headers, name: string) {
  headers.append("Set-Cookie", `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
}

// Step 1: redirect the browser to Google's consent screen.
auth.get("/google/start", async (c) => {
  const state = crypto.randomUUID();
  const url = buildGoogleAuthorizeUrl({
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: c.env.GOOGLE_REDIRECT_URI,
    state,
  });
  // The state is stored in a short-lived cookie and checked on callback to
  // guard against CSRF on the OAuth redirect.
  const res = new Response(null, { status: 302, headers: { Location: url } });
  setCookie(res.headers, "oauth_state", state, 600);
  return res;
});

// Step 2: Google redirects back here with a one-time code.
auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const cookies = parseCookies(c.req.header("Cookie") ?? null);

  if (!code || !state || state !== cookies["oauth_state"]) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: c.env.GOOGLE_REDIRECT_URI,
    });
    const claims = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_CLIENT_ID);

    let user = await c.env.DB.prepare("SELECT * FROM users WHERE google_sub = ?").bind(claims.sub).first<any>();

    if (!user) {
      const isOwner =
        c.env.BOOTSTRAP_OWNER_EMAIL &&
        claims.email.toLowerCase() === c.env.BOOTSTRAP_OWNER_EMAIL.toLowerCase();

      let accountId: number;
      if (isOwner) {
        // Link to the migrated account (id 1) instead of creating a new tenant.
        const existingOwnerLink = await c.env.DB.prepare(
          "SELECT id FROM users WHERE account_id = 1 AND role = 'owner'"
        ).first();
        accountId = 1;
        if (existingOwnerLink) {
          // account 1 already has an owner linked — fall through to a normal
          // new account instead of silently taking over someone else's data.
          const newAccount = await c.env.DB.prepare(
            "INSERT INTO accounts (name, subscription_status, trial_ends_at) VALUES (?, 'trialing', datetime('now', '+14 days'))"
          )
            .bind(`${claims.name || claims.email}'s Business`)
            .run();
          accountId = Number(newAccount.meta.last_row_id);
          await c.env.DB.prepare("INSERT INTO company_profile (account_id, name) VALUES (?, ?)")
            .bind(accountId, `${claims.name || claims.email}'s Business`)
            .run();
        }
      } else {
        const newAccount = await c.env.DB.prepare(
          "INSERT INTO accounts (name, subscription_status, trial_ends_at) VALUES (?, 'trialing', datetime('now', '+14 days'))"
        )
          .bind(`${claims.name || claims.email}'s Business`)
          .run();
        accountId = Number(newAccount.meta.last_row_id);
        await c.env.DB.prepare("INSERT INTO company_profile (account_id, name) VALUES (?, ?)")
          .bind(accountId, `${claims.name || claims.email}'s Business`)
          .run();
      }

      const inserted = await c.env.DB.prepare(
        `INSERT INTO users (account_id, google_sub, email, name, avatar_url, role)
         VALUES (?, ?, ?, ?, ?, 'owner')`
      )
        .bind(accountId, claims.sub, claims.email, claims.name ?? null, claims.picture ?? null)
        .run();

      user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(inserted.meta.last_row_id).first();
    }

    const session = await signSession(
      {
        userId: user.id,
        accountId: user.account_id,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds(),
      },
      c.env.SESSION_SECRET
    );

    const res = new Response(null, { status: 302, headers: { Location: `${c.env.FRONTEND_URL}/` } });
    setCookie(res.headers, sessionCookieName(), session, sessionTtlSeconds());
    clearCookie(res.headers, "oauth_state");
    return res;
  } catch (err) {
    console.error(err);
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=auth_failed`);
  }
});

auth.get("/me", async (c) => {
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  const token = cookies[sessionCookieName()];
  if (!token) return c.json({ user: null }, 401);

  const session = await verifySession(token, c.env.SESSION_SECRET);
  if (!session) return c.json({ user: null }, 401);

  const user = await c.env.DB.prepare("SELECT id, email, name, avatar_url, role, account_id FROM users WHERE id = ?")
    .bind(session.userId)
    .first<any>();
  if (!user) return c.json({ user: null }, 401);

  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(user.account_id).first();

  return c.json({
    user: { ...user, isAdmin: isAdminEmail(user.email, c.env.ADMIN_EMAILS) },
    account,
  });
});

auth.post("/logout", async (c) => {
  const res = c.json({ ok: true });
  clearCookie(res.headers, sessionCookieName());
  return res;
});
