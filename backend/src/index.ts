import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, AuthContext } from "./types";

import { auth } from "./routes/auth";
import { company } from "./routes/company";
import { customers } from "./routes/customers";
import { products } from "./routes/products";
import { quotations } from "./routes/quotations";
import { invoices } from "./routes/invoices";
import { bills } from "./routes/bills";
import { history } from "./routes/history";
import { billing } from "./routes/billing";

const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.ALLOWED_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "rizipt-v2-api" }));

// Auth endpoints are public (they establish the session in the first place).
// Every other router applies requireAuth (and requireActiveSubscription for
// write routes) on itself — see the .use("*", ...) call at the top of each
// route file — rather than being gated here by path pattern, since Hono's
// "/x/*" middleware pattern doesn't reliably match the bare "/x" path.
app.route("/api/auth", auth);
app.route("/api/company-profile", company);
app.route("/api/customers", customers);
app.route("/api/products", products);
app.route("/api/quotations", quotations);
app.route("/api/invoices", invoices);
app.route("/api/bills", bills);
app.route("/api/billing-history", history);
app.route("/api/billing", billing);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

export default app;

