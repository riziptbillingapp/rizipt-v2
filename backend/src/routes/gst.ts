import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env, AuthContext } from "../types";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";
import { splitTax, B2C_LARGE_THRESHOLD, GST_STATE_CODES } from "../utils/gst";
import type { LineItem } from "../utils/totals";

export const gst = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
gst.use("*", requireAuth, requireActiveSubscription);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface SupplyDoc {
  doc_type: "invoice" | "bill";
  doc_number: string;
  issue_date: string;
  customer_name: string;
  customer_gstin: string | null;
  place_of_supply: string | null;
  items: LineItem[];
  grand_total: number;
}

/**
 * Pulls every document that represents an actual outward taxable supply for
 * the period. This deliberately does NOT just query "all invoices" or "all
 * bills" — it has to avoid double counting:
 *  - Invoices: every issued (non-draft, non-rejected, non-discarded) invoice
 *    counts, whether or not it's since been converted to a bill/receipt —
 *    the bill conversion only records payment, the supply already happened
 *    at invoice issuance.
 *  - Bills: only source_type = 'direct' (walk-in sales with no invoice
 *    behind them) count. Bills converted from an invoice are the payment
 *    record of a supply already counted via that invoice.
 */
async function loadPeriodSupplies(db: D1Database, accountId: number, period: string): Promise<SupplyDoc[]> {
  const like = `${period}%`;

  const { results: invoiceRows } = await db
    .prepare(
      `SELECT i.doc_number, i.issue_date, i.items, i.grand_total, i.place_of_supply,
              c.name as customer_name, c.gstin as customer_gstin
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.account_id = ? AND i.discarded_at IS NULL
         AND i.status NOT IN ('draft', 'rejected')
         AND i.issue_date LIKE ?
       ORDER BY i.issue_date ASC`
    )
    .bind(accountId, like)
    .all<any>();

  const { results: billRows } = await db
    .prepare(
      `SELECT b.doc_number, b.issue_date, b.items, b.grand_total, b.place_of_supply,
              c.name as customer_name, c.gstin as customer_gstin
       FROM bills b JOIN customers c ON c.id = b.customer_id
       WHERE b.account_id = ? AND b.discarded_at IS NULL
         AND b.source_type = 'direct' AND b.status != 'void'
         AND b.issue_date LIKE ?
       ORDER BY b.issue_date ASC`
    )
    .bind(accountId, like)
    .all<any>();

  const toDoc = (row: any, docType: "invoice" | "bill"): SupplyDoc => ({
    doc_type: docType,
    doc_number: row.doc_number,
    issue_date: row.issue_date,
    customer_name: row.customer_name,
    customer_gstin: row.customer_gstin || null,
    place_of_supply: row.place_of_supply || null,
    items: JSON.parse(row.items || "[]"),
    grand_total: row.grand_total,
  });

  return [
    ...(invoiceRows ?? []).map((r) => toDoc(r, "invoice")),
    ...(billRows ?? []).map((r) => toDoc(r, "bill")),
  ];
}

interface RateLine {
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function emptyRateLine(): RateLine {
  return { taxable_value: 0, igst: 0, cgst: 0, sgst: 0 };
}

function addRateLine(a: RateLine, b: RateLine): RateLine {
  return {
    taxable_value: round2(a.taxable_value + b.taxable_value),
    igst: round2(a.igst + b.igst),
    cgst: round2(a.cgst + b.cgst),
    sgst: round2(a.sgst + b.sgst),
  };
}

gst.get("/gstr1", async (c) => {
  const { accountId } = c.get("auth");
  const period = c.req.query("period"); // "YYYY-MM"
  const format = c.req.query("format") || "json";
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ error: "period is required, in YYYY-MM format" }, 400);
  }

  const company = await c.env.DB.prepare("SELECT gst_state_code, gstin, name FROM company_profile WHERE account_id = ?")
    .bind(accountId)
    .first<{ gst_state_code: string | null; gstin: string | null; name: string | null }>();
  const home = company?.gst_state_code || null;

  const docs = await loadPeriodSupplies(c.env.DB, accountId, period);

  const b2b: any[] = [];
  const b2cl: any[] = [];
  // B2C Small is aggregated by place_of_supply + rate, not per-invoice.
  const b2csMap = new Map<string, RateLine & { place_of_supply: string | null; rate: number }>();
  const hsnMap = new Map<string, RateLine & { hsn_sac: string; rate: number; unit: string; quantity: number }>();

  for (const doc of docs) {
    // Group this document's line items by tax rate so a mixed-rate invoice
    // produces one row per rate, matching how GSTR-1 actually expects B2B
    // and HSN data to be reported.
    const byRate = new Map<number, RateLine>();
    for (const item of doc.items) {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const discountPct = Number(item.discount_percent) || 0;
      const rate = Number(item.tax_rate) || 0;
      const gross = qty * price;
      const net = round2(Math.max(gross - gross * (discountPct / 100), 0));
      const tax = round2(net * (rate / 100));
      const split = splitTax(tax, home, doc.place_of_supply);

      const line: RateLine = { taxable_value: net, igst: split.igst, cgst: split.cgst, sgst: split.sgst };
      byRate.set(rate, addRateLine(byRate.get(rate) || emptyRateLine(), line));

      // HSN summary, across all documents regardless of B2B/B2C.
      const hsn = item.hsn_sac || "—";
      const hsnKey = `${hsn}::${rate}::${item.unit || ""}`;
      const existingHsn = hsnMap.get(hsnKey);
      hsnMap.set(hsnKey, {
        hsn_sac: hsn,
        rate,
        unit: item.unit || "",
        quantity: (existingHsn?.quantity || 0) + qty,
        ...addRateLine(existingHsn || emptyRateLine(), line),
      });
    }

    const isInterstate = !!(home && doc.place_of_supply && home !== doc.place_of_supply);

    if (doc.customer_gstin) {
      // B2B — one row per document per rate.
      for (const [rate, line] of byRate) {
        b2b.push({
          doc_type: doc.doc_type,
          doc_number: doc.doc_number,
          issue_date: doc.issue_date,
          customer_name: doc.customer_name,
          customer_gstin: doc.customer_gstin,
          place_of_supply: doc.place_of_supply,
          place_of_supply_name: doc.place_of_supply ? GST_STATE_CODES[doc.place_of_supply] : null,
          invoice_value: doc.grand_total,
          rate,
          ...line,
        });
      }
    } else if (isInterstate && doc.grand_total > B2C_LARGE_THRESHOLD) {
      // B2C Large — interstate, above threshold, still per-document per-rate.
      for (const [rate, line] of byRate) {
        b2cl.push({
          doc_type: doc.doc_type,
          doc_number: doc.doc_number,
          issue_date: doc.issue_date,
          place_of_supply: doc.place_of_supply,
          place_of_supply_name: doc.place_of_supply ? GST_STATE_CODES[doc.place_of_supply] : null,
          invoice_value: doc.grand_total,
          rate,
          ...line,
        });
      }
    } else {
      // B2C Small — aggregated by place of supply + rate.
      for (const [rate, line] of byRate) {
        const key = `${doc.place_of_supply || home || ""}::${rate}`;
        const existing = b2csMap.get(key);
        b2csMap.set(key, {
          place_of_supply: doc.place_of_supply || home || null,
          rate,
          ...addRateLine(existing || emptyRateLine(), line),
        });
      }
    }
  }

  const b2cs = Array.from(b2csMap.values()).map((row) => ({
    ...row,
    place_of_supply_name: row.place_of_supply ? GST_STATE_CODES[row.place_of_supply] : null,
  }));
  const hsn = Array.from(hsnMap.values());

  const totals = docs.reduce(
    (acc, doc) => {
      acc.document_count += 1;
      acc.total_value = round2(acc.total_value + doc.grand_total);
      return acc;
    },
    { document_count: 0, total_value: 0 }
  );

  const payload = {
    period,
    company: { name: company?.name || null, gstin: company?.gstin || null, gst_state_code: home },
    summary: totals,
    b2b,
    b2cl,
    b2cs,
    hsn,
    note:
      "Auto-generated from Rizipt billing data. B2C Large threshold assumed at ₹1,00,000 — verify against the current CBIC threshold before filing. Nil-rated, exempt, and zero-rated supplies are not separately classified; review 0% rate lines before filing. Cross-check totals against your GST portal draft before submission.",
  };

  if (format === "csv") {
    const lines: string[] = [];
    lines.push(`GSTR-1 — ${period}`);
    lines.push("");
    lines.push("B2B");
    lines.push("Doc Type,Doc Number,Date,Customer,GSTIN,Place of Supply,Invoice Value,Rate,Taxable Value,IGST,CGST,SGST");
    for (const r of b2b) {
      lines.push(
        [r.doc_type, r.doc_number, r.issue_date, r.customer_name, r.customer_gstin, r.place_of_supply, r.invoice_value, r.rate, r.taxable_value, r.igst, r.cgst, r.sgst]
          .map((v) => `"${v ?? ""}"`)
          .join(",")
      );
    }
    lines.push("");
    lines.push("B2C Large");
    lines.push("Doc Type,Doc Number,Date,Place of Supply,Invoice Value,Rate,Taxable Value,IGST");
    for (const r of b2cl) {
      lines.push(
        [r.doc_type, r.doc_number, r.issue_date, r.place_of_supply, r.invoice_value, r.rate, r.taxable_value, r.igst]
          .map((v) => `"${v ?? ""}"`)
          .join(",")
      );
    }
    lines.push("");
    lines.push("B2C Small (aggregated)");
    lines.push("Place of Supply,Rate,Taxable Value,IGST,CGST,SGST");
    for (const r of b2cs) {
      lines.push([r.place_of_supply, r.rate, r.taxable_value, r.igst, r.cgst, r.sgst].map((v) => `"${v ?? ""}"`).join(","));
    }
    lines.push("");
    lines.push("HSN Summary");
    lines.push("HSN/SAC,Rate,Unit,Quantity,Taxable Value,IGST,CGST,SGST");
    for (const r of hsn) {
      lines.push(
        [r.hsn_sac, r.rate, r.unit, r.quantity, r.taxable_value, r.igst, r.cgst, r.sgst].map((v) => `"${v ?? ""}"`).join(",")
      );
    }
    return c.text(lines.join("\n"), 200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="GSTR1-${period}.csv"`,
    });
  }

  return c.json(payload);
});

gst.get("/gstr3b", async (c) => {
  const { accountId } = c.get("auth");
  const period = c.req.query("period");
  const format = c.req.query("format") || "json";
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ error: "period is required, in YYYY-MM format" }, 400);
  }

  const company = await c.env.DB.prepare("SELECT gst_state_code, gstin, name FROM company_profile WHERE account_id = ?")
    .bind(accountId)
    .first<{ gst_state_code: string | null; gstin: string | null; name: string | null }>();
  const home = company?.gst_state_code || null;

  const docs = await loadPeriodSupplies(c.env.DB, accountId, period);

  let taxableValue = 0;
  let igst = 0;
  let cgst = 0;
  let sgst = 0;

  for (const doc of docs) {
    for (const item of doc.items) {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const discountPct = Number(item.discount_percent) || 0;
      const rate = Number(item.tax_rate) || 0;
      const gross = qty * price;
      const net = round2(Math.max(gross - gross * (discountPct / 100), 0));
      const tax = round2(net * (rate / 100));
      const split = splitTax(tax, home, doc.place_of_supply);

      taxableValue = round2(taxableValue + net);
      igst = round2(igst + split.igst);
      cgst = round2(cgst + split.cgst);
      sgst = round2(sgst + split.sgst);
    }
  }

  const payload = {
    period,
    company: { name: company?.name || null, gstin: company?.gstin || null, gst_state_code: home },
    // Maps to GSTR-3B table 3.1(a) — Outward taxable supplies (other than
    // zero rated, nil rated and exempted).
    outward_taxable_supplies: {
      taxable_value: taxableValue,
      igst,
      cgst,
      sgst,
      total_tax: round2(igst + cgst + sgst),
    },
    document_count: docs.length,
    note:
      "Covers table 3.1(a) only, computed from invoiced/billed outward supplies. Nil-rated, exempt, zero-rated (export), and reverse-charge supplies are not tracked by Rizipt and must be added manually. Verify against your GST portal draft before filing.",
  };

  if (format === "csv") {
    const lines: string[] = [];
    lines.push(`GSTR-3B — ${period}`);
    lines.push("");
    lines.push("Section,Taxable Value,IGST,CGST,SGST,Total Tax");
    lines.push(
      [
        "3.1(a) Outward taxable supplies",
        payload.outward_taxable_supplies.taxable_value,
        payload.outward_taxable_supplies.igst,
        payload.outward_taxable_supplies.cgst,
        payload.outward_taxable_supplies.sgst,
        payload.outward_taxable_supplies.total_tax,
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );
    return c.text(lines.join("\n"), 200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="GSTR3B-${period}.csv"`,
    });
  }

  return c.json(payload);
});
