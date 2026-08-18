import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";

import { company } from "./routes/company";
import { customers } from "./routes/customers";
import { products } from "./routes/products";
import { quotations } from "./routes/quotations";
import { invoices } from "./routes/invoices";
import { bills } from "./routes/bills";
import { history } from "./routes/history";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.ALLOWED_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  });
  return corsMiddleware(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "rizipt-v2-api" }));

app.route("/api/company-profile", company);
app.route("/api/customers", customers);
app.route("/api/products", products);
app.route("/api/quotations", quotations);
app.route("/api/invoices", invoices);
app.route("/api/bills", bills);
app.route("/api/billing-history", history);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
