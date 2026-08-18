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

/*
 * Allowed frontend origins
 *
 * Both domains can use the same API during the migration.
 */
const allowedOrigins = [
  "https://rizipt-v2.pages.dev",
  "https://rizipt.in",
];

/*
 * CORS
 */
app.use("*", async (c, next) => {
  const requestOrigin = c.req.header("Origin");

  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) {
        return allowedOrigins[0];
      }

      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      return allowedOrigins[0];
    },

    allowMethods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowHeaders: [
      "Content-Type",
    ],
  });

  return corsMiddleware(c, next);
});

/*
 * Health check
 */
app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "rizipt-v2-api",
  });
});

/*
 * Company Profile
 */
app.route("/api/company-profile", company);

/*
 * Customers
 */
app.route("/api/customers", customers);

/*
 * Products
 */
app.route("/api/products", products);

/*
 * Quotations
 */
app.route("/api/quotations", quotations);

/*
 * Invoices
 */
app.route("/api/invoices", invoices);

/*
 * Bills / Receipts
 */
app.route("/api/bills", bills);

/*
 * Billing History
 */
app.route("/api/billing-history", history);

/*
 * Not Found
 */
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
    },
    404
  );
});

/*
 * Error Handler
 */
app.onError((err, c) => {
  console.error(err);

  return c.json(
    {
      error: "Internal server error",
    },
    500
  );
});

export default app;