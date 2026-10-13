import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env, AuthContext } from "../types";
import { requireAuth, requireActiveSubscription } from "../middleware/auth";
import { B2C_LARGE_THRESHOLD, GST_STATE_CODES } from "../utils/gst";
import type { LineItem } from "../utils/totals";

/**
 * QRMP (quarterly return, monthly payment) GST filing.
 *
 *  - Month 1 and 2 of a quarter: optional IFF (B2B invoices only).
 *  - Quarter: GSTR-1 (skips what went out in IFF, except in the HSN summary)
 *    and GSTR-3B (output tax - ITC - monthly PMT-06 payments = cash due).
 *
 * An invoice counts once it is converted to a Bill/Receipt ("receipted"),
 * unless the user overrides it (include / exclude). Draft, rejected, void and
 * discarded invoices never count. Direct bills (no invoice behind them) count
 * on their own. The tax period of a supply is the invoice/bill issue date.
 */
export const gstFiling = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
gstFiling.use("*", requireAuth, requireActiveSubscription);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// ---------- period helpers ----------------------------------------------

/** FY = starting year (2026 => FY 2026-27). q = 1..4 (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar). */
function quarterMonths(fy: number, q: number): string[] {
  const starts = [
    [fy, 4],
    [fy, 7],
    [fy, 10],
    [fy + 1, 1],
  ][q - 1];
  const [y, m] = starts;
  return [0, 1, 2].map((i) => `${y}-${String(m + i).padStart(2, "0")}`);
}

function parseQuarter(c: { req: { query: (k: string) => string | undefined } }): { fy: number; q: number; key: string; months: string[] } | null {
  const fy = Number(c.req.query("fy"));
  const q = Number(c.req.query("q"));
  if (!Number.isInteger(fy) || fy < 2017 || fy > 2100 || ![1, 2, 3, 4].includes(q)) return null;
  return { fy, q, key: `${fy}-Q${q}`, months: quarterMonths(fy, q) };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (p: string) => `${MONTH_NAMES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const portalYear = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;

/** Day-of-month due dates are the statutory defaults — the portal's displayed date always wins. */
function nextMonthDate(period: string, day: number): string {
  const [y, m] = period.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------- supply loading ----------------------------------------------

interface RateLine {
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}
const emptyLine = (): RateLine => ({ taxable_value: 0, igst: 0, cgst: 0, sgst: 0 });
const addLine = (a: RateLine, b: RateLine): RateLine => ({
  taxable_value: round2(a.taxable_value + b.taxable_value),
  igst: round2(a.igst + b.igst),
  cgst: round2(a.cgst + b.cgst),
  sgst: round2(a.sgst + b.sgst),
});

interface SupplyDoc {
  doc_type: "invoice" | "bill";
  id: number;
  doc_number: string;
  issue_date: string;
  month: string;
  customer_name: string;
  customer_gstin: string | null;
  place_of_supply: string | null;
  status: string;
  receipted: boolean;
  receipt_number: string | null;
  override: "include" | "exclude" | null;
  included: boolean;
  in_iff: string | null; // IFF period it was furnished in
  items: LineItem[];
  grand_total: number;
  byRate: Map<number, RateLine>;
  isB2B: boolean;
}

/**
 * Tax on a taxable value: IGST on the full rate, or CGST and SGST each on half
 * the rate, each rounded on its own. This is how the GST portal computes the
 * heads, so a taxable value like 5,625.15 gives 506.26 + 506.26 (not 506.27 +
 * 506.26) and Rizipt's figures agree with the portal to the paisa.
 */
function splitOnTaxable(taxable: number, rate: number, home: string | null, pos: string | null) {
  const place = pos || home;
  if (home && place && home !== place) return { igst: round2(taxable * (rate / 100)), cgst: 0, sgst: 0 };
  const half = round2(taxable * (rate / 200));
  return { igst: 0, cgst: half, sgst: half };
}

function buildByRate(items: LineItem[], home: string | null, pos: string | null) {
  // Taxable value grouped per rate first, tax computed on the group — this is
  // how the invoice itself shows tax and how the portal sums a rate row.
  const taxable = new Map<number, number>();
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const disc = Number(item.discount_percent) || 0;
    const rate = Number(item.tax_rate) || 0;
    const gross = qty * price;
    const net = round2(Math.max(gross - gross * (disc / 100), 0));
    taxable.set(rate, round2((taxable.get(rate) || 0) + net));
  }
  const out = new Map<number, RateLine>();
  for (const [rate, tv] of taxable) {
    const split = splitOnTaxable(tv, rate, home, pos);
    out.set(rate, { taxable_value: tv, igst: split.igst, cgst: split.cgst, sgst: split.sgst });
  }
  return out;
}

interface Loaded {
  home: string | null;
  company: { name: string | null; gstin: string | null };
  docs: SupplyDoc[]; // everything that could matter (included or not)
  draftCount: number;
  invoiceNumbers: { number: string; status: string; month: string }[];
}

async function loadMonths(db: D1Database, accountId: number, months: string[]): Promise<Loaded> {
  const first = `${months[0]}-01`;
  const last = `${months[months.length - 1]}-31`;

  const company = await db
    .prepare("SELECT gst_state_code, gstin, name FROM company_profile WHERE account_id = ?")
    .bind(accountId)
    .first<{ gst_state_code: string | null; gstin: string | null; name: string | null }>();
  const home = company?.gst_state_code || (company?.gstin ? company.gstin.slice(0, 2) : null);

  const { results: invRows } = await db
    .prepare(
      `SELECT i.id, i.doc_number, i.issue_date, i.items, i.grand_total, i.place_of_supply, i.status,
              i.converted_to_bill_id, c.name AS customer_name, c.gstin AS customer_gstin,
              o.action AS override_action, b.doc_number AS receipt_number
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN gst_invoice_overrides o ON o.invoice_id = i.id AND o.account_id = i.account_id
       LEFT JOIN bills b ON b.id = i.converted_to_bill_id AND b.account_id = i.account_id
       WHERE i.account_id = ? AND i.discarded_at IS NULL AND i.issue_date >= ? AND i.issue_date <= ?
       ORDER BY i.issue_date ASC, i.id ASC`
    )
    .bind(accountId, first, last)
    .all<any>();

  const { results: billRows } = await db
    .prepare(
      `SELECT b.id, b.doc_number, b.issue_date, b.items, b.grand_total, b.place_of_supply, b.status,
              c.name AS customer_name, c.gstin AS customer_gstin
       FROM bills b JOIN customers c ON c.id = b.customer_id
       WHERE b.account_id = ? AND b.discarded_at IS NULL AND b.source_type = 'direct'
         AND b.issue_date >= ? AND b.issue_date <= ?
       ORDER BY b.issue_date ASC, b.id ASC`
    )
    .bind(accountId, first, last)
    .all<any>();

  const { results: iffRows } = await db
    .prepare("SELECT doc_type, doc_id, period FROM gst_iff_documents WHERE account_id = ?")
    .bind(accountId)
    .all<any>();
  const iffMap = new Map<string, string>();
  for (const r of iffRows ?? []) iffMap.set(`${r.doc_type}:${r.doc_id}`, r.period);

  const docs: SupplyDoc[] = [];
  const invoiceNumbers: Loaded["invoiceNumbers"] = [];
  let draftCount = 0;

  for (const r of invRows ?? []) {
    invoiceNumbers.push({ number: r.doc_number, status: r.status, month: String(r.issue_date).slice(0, 7) });
    if (r.status === "draft") draftCount += 1;
    if (["draft", "rejected", "void"].includes(r.status)) continue; // never counts
    const receipted = r.status === "converted" || !!r.converted_to_bill_id;
    const override = (r.override_action as "include" | "exclude" | null) || null;
    const included = override === "exclude" ? false : override === "include" ? true : receipted;
    const items: LineItem[] = JSON.parse(r.items || "[]");
    const pos = r.place_of_supply || null;
    docs.push({
      doc_type: "invoice",
      id: r.id,
      doc_number: r.doc_number,
      issue_date: r.issue_date,
      month: String(r.issue_date).slice(0, 7),
      customer_name: r.customer_name,
      customer_gstin: r.customer_gstin ? String(r.customer_gstin).trim().toUpperCase() : null,
      place_of_supply: pos,
      status: r.status,
      receipted,
      receipt_number: r.receipt_number || null,
      override,
      included,
      in_iff: iffMap.get(`invoice:${r.id}`) || null,
      items,
      grand_total: r.grand_total,
      byRate: buildByRate(items, home, pos),
      isB2B: !!r.customer_gstin,
    });
  }

  for (const r of billRows ?? []) {
    if (r.status === "void") continue;
    const items: LineItem[] = JSON.parse(r.items || "[]");
    const pos = r.place_of_supply || null;
    docs.push({
      doc_type: "bill",
      id: r.id,
      doc_number: r.doc_number,
      issue_date: r.issue_date,
      month: String(r.issue_date).slice(0, 7),
      customer_name: r.customer_name,
      customer_gstin: r.customer_gstin ? String(r.customer_gstin).trim().toUpperCase() : null,
      place_of_supply: pos,
      status: r.status,
      receipted: true,
      receipt_number: r.doc_number,
      override: null,
      included: true,
      in_iff: iffMap.get(`bill:${r.id}`) || null,
      items,
      grand_total: r.grand_total,
      byRate: buildByRate(items, home, pos),
      isB2B: !!r.customer_gstin,
    });
  }

  return {
    home,
    company: { name: company?.name || null, gstin: company?.gstin || null },
    docs,
    draftCount,
    invoiceNumbers,
  };
}

function docTotals(docs: SupplyDoc[]): RateLine & { count: number; invoice_value: number } {
  let t = emptyLine();
  let value = 0;
  for (const d of docs) {
    for (const l of d.byRate.values()) t = addLine(t, l);
    value = round2(value + d.grand_total);
  }
  return { ...t, count: docs.length, invoice_value: value };
}

const posName = (code: string | null) => (code ? GST_STATE_CODES[code] || code : null);

function docRows(d: SupplyDoc) {
  return Array.from(d.byRate.entries()).map(([rate, line]) => ({
    doc_type: d.doc_type,
    doc_number: d.doc_number,
    issue_date: d.issue_date,
    customer_name: d.customer_name,
    customer_gstin: d.customer_gstin,
    place_of_supply: d.place_of_supply,
    place_of_supply_name: posName(d.place_of_supply),
    invoice_value: d.grand_total,
    rate,
    ...line,
  }));
}

function hsnWithTax(docs: SupplyDoc[], home: string | null) {
  // Tax split depends on each document's place of supply, so accumulate per document.
  const map = new Map<string, any>();
  for (const d of docs) {
    const perDoc = new Map<string, any>();
    for (const item of d.items) {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const disc = Number(item.discount_percent) || 0;
      const rate = Number(item.tax_rate) || 0;
      const gross = qty * price;
      const net = round2(Math.max(gross - gross * (disc / 100), 0));
      const uqc = (item.unit || "OTH").toString().toUpperCase().slice(0, 3);
      const key = `${item.hsn_sac || ""}::${rate}::${uqc}`;
      const ex = perDoc.get(key) || { hsn_sac: item.hsn_sac || "", rate, uqc, quantity: 0, taxable_value: 0 };
      ex.quantity = round2(ex.quantity + qty);
      ex.taxable_value = round2(ex.taxable_value + net);
      perDoc.set(key, ex);
    }
    for (const [key, v] of perDoc) {
      const split = splitOnTaxable(v.taxable_value, v.rate, home, d.place_of_supply);
      const ex = map.get(key) || { hsn_sac: v.hsn_sac, rate: v.rate, uqc: v.uqc, quantity: 0, taxable_value: 0, igst: 0, cgst: 0, sgst: 0 };
      ex.quantity = round2(ex.quantity + v.quantity);
      ex.taxable_value = round2(ex.taxable_value + v.taxable_value);
      ex.igst = round2(ex.igst + split.igst);
      ex.cgst = round2(ex.cgst + split.cgst);
      ex.sgst = round2(ex.sgst + split.sgst);
      map.set(key, ex);
    }
  }
  return Array.from(map.values()).map((r) => ({ ...r, total_value: round2(r.taxable_value + r.igst + r.cgst + r.sgst) }));
}

/** Data-quality checks that apply to a set of included documents. */
function exceptionsFor(docs: SupplyDoc[], home: string | null) {
  const ex: { level: "red" | "amber"; text: string }[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (seen.has(d.doc_number)) ex.push({ level: "red", text: `Duplicate document number ${d.doc_number}.` });
    seen.add(d.doc_number);
    if (d.customer_gstin && !GSTIN_RE.test(d.customer_gstin))
      ex.push({ level: "red", text: `${d.doc_number}: customer GSTIN "${d.customer_gstin}" is not in a valid format.` });
    if (d.items.some((i) => !i.hsn_sac || !String(i.hsn_sac).trim()))
      ex.push({ level: "red", text: `${d.doc_number}: a line item has no HSN/SAC — the portal requires it in Table 12.` });
    if (!d.place_of_supply)
      ex.push({ level: "amber", text: `${d.doc_number}: no place of supply saved — treated as ${posName(home) || "home state"} (intra-state).` });
    if (d.customer_gstin && d.place_of_supply && d.customer_gstin.slice(0, 2) !== d.place_of_supply)
      ex.push({ level: "amber", text: `${d.doc_number}: place of supply ${d.place_of_supply} differs from customer GSTIN state ${d.customer_gstin.slice(0, 2)} — confirm.` });
    if (d.items.some((i) => Number(i.tax_rate) === 0))
      ex.push({ level: "amber", text: `${d.doc_number}: has 0% lines — Rizipt does not separate nil-rated / exempt / non-GST supplies; classify manually.` });
  }
  return ex;
}

function unreceiptedWarnings(docs: SupplyDoc[]) {
  return docs
    .filter((d) => d.doc_type === "invoice" && !d.receipted)
    .map((d) => ({
      id: d.id,
      doc_number: d.doc_number,
      issue_date: d.issue_date,
      month: d.month,
      customer_name: d.customer_name,
      customer_gstin: d.customer_gstin,
      status: d.status,
      grand_total: d.grand_total,
      override: d.override,
      included: d.included,
      ...docTotals([d]),
    }));
}

function overrideRows(docs: SupplyDoc[]) {
  return docs.filter((d) => d.doc_type === "invoice" && d.override).map((d) => ({ id: d.id, doc_number: d.doc_number, override: d.override }));
}

// ---------- Table 13: documents issued ----------------------------------

function documentsIssued(inv: Loaded["invoiceNumbers"]) {
  const groups = new Map<string, { prefix: string; items: { n: number; raw: string; cancelled: boolean }[] }>();
  for (const i of inv) {
    if (i.status === "draft") continue; // never issued
    const m = i.number.match(/^(.*?)(\d+)$/);
    const prefix = m ? m[1] : i.number;
    const n = m ? parseInt(m[2], 10) : 0;
    const g = groups.get(prefix) || { prefix, items: [] };
    g.items.push({ n, raw: i.number, cancelled: ["void", "rejected"].includes(i.status) });
    groups.set(prefix, g);
  }
  return Array.from(groups.values()).map((g) => {
    g.items.sort((a, b) => a.n - b.n);
    const from = g.items[0];
    const to = g.items[g.items.length - 1];
    const have = new Set(g.items.map((x) => x.n));
    const gaps: number[] = [];
    if (to.n - from.n <= 200) for (let n = from.n + 1; n < to.n; n++) if (!have.has(n)) gaps.push(n);
    const cancelled = g.items.filter((x) => x.cancelled).length;
    return {
      nature: "Invoices for outward supply",
      from: from.raw,
      to: to.raw,
      total_number: g.items.length,
      cancelled,
      net_issued: g.items.length - cancelled,
      missing_numbers: gaps.slice(0, 25).map((n) => g.prefix + String(n).padStart(from.raw.length - g.prefix.length, "0")),
    };
  });
}

// ---------- ITC / payments / filings helpers ----------------------------

async function loadFilings(db: D1Database, accountId: number) {
  const { results } = await db
    .prepare("SELECT id, return_type, period, arn, filed_on, notes FROM gst_filings WHERE account_id = ?")
    .bind(accountId)
    .all<any>();
  return results ?? [];
}

const findFiling = (filings: any[], type: string, period: string) => filings.find((f) => f.return_type === type && f.period === period) || null;

// ---------- endpoints ----------------------------------------------------

/** Quarter dashboard: one card per return, with status and figures. */
gstFiling.get("/overview", async (c) => {
  const { accountId } = c.get("auth");
  const qp = parseQuarter(c);
  if (!qp) return c.json({ error: "fy (start year) and q (1-4) are required" }, 400);

  const loaded = await loadMonths(c.env.DB, accountId, qp.months);
  const filings = await loadFilings(c.env.DB, accountId);
  const included = loaded.docs.filter((d) => d.included);
  const warnings = unreceiptedWarnings(loaded.docs);

  const { results: payRows } = await c.env.DB.prepare("SELECT igst, cgst, sgst FROM gst_payments WHERE account_id = ? AND quarter = ?")
    .bind(accountId, qp.key)
    .all<any>();
  const paid = (payRows ?? []).reduce((s, p) => round2(s + p.igst + p.cgst + p.sgst), 0);

  const monthsInfo = qp.months.map((m, idx) => {
    const monthDocs = included.filter((d) => d.month === m);
    const b2b = monthDocs.filter((d) => d.isB2B && !d.in_iff);
    const iff = findFiling(filings, "IFF", m);
    return {
      period: m,
      label: monthLabel(m),
      position: idx + 1,
      iff_allowed: idx < 2,
      iff_due: nextMonthDate(m, 13),
      pmt06_due: idx < 2 ? nextMonthDate(m, 25) : null,
      iff_filing: iff,
      b2b_pending_for_iff: docTotals(b2b),
      all_included: docTotals(monthDocs),
    };
  });

  const qTotals = docTotals(included);
  const lastMonth = qp.months[2];
  return c.json({
    fy: qp.fy,
    portal_year: portalYear(qp.fy),
    q: qp.q,
    quarter: qp.key,
    quarter_label: `${monthLabel(qp.months[0])} – ${monthLabel(lastMonth)}`,
    months: monthsInfo,
    gstr1: {
      due: nextMonthDate(lastMonth, 13),
      filing: findFiling(filings, "GSTR1", qp.key),
    },
    gstr3b: {
      due: nextMonthDate(lastMonth, 22), // 22nd for Tamil Nadu; 24th for some states — confirm on portal
      filing: findFiling(filings, "GSTR3B", qp.key),
    },
    quarter_totals: qTotals,
    paid_so_far: paid,
    unreceipted_count: warnings.length,
    unreceipted_value: round2(warnings.reduce((s, w) => s + w.taxable_value, 0)),
    draft_count: loaded.draftCount,
    company: loaded.company,
    due_note: "Statutory default dates. Always use the due date shown on the GST portal Returns Dashboard.",
  });
});

/** Invoices the user can include/exclude: everything issued in the quarter that is not receipted, plus overrides. */
gstFiling.get("/review", async (c) => {
  const { accountId } = c.get("auth");
  const qp = parseQuarter(c);
  if (!qp) return c.json({ error: "fy (start year) and q (1-4) are required" }, 400);
  const loaded = await loadMonths(c.env.DB, accountId, qp.months);
  return c.json({
    quarter: qp.key,
    unreceipted: unreceiptedWarnings(loaded.docs),
    overridden_receipted: loaded.docs
      .filter((d) => d.doc_type === "invoice" && d.receipted && d.override === "exclude")
      .map((d) => ({ id: d.id, doc_number: d.doc_number, issue_date: d.issue_date, customer_name: d.customer_name, grand_total: d.grand_total, override: d.override })),
    draft_count: loaded.draftCount,
    note: "GST is due on the supply when the invoice is issued, even if it has not been receipted yet. Include an issued-but-unreceipted invoice here if it must be reported this period.",
  });
});

gstFiling.put("/override", async (c) => {
  const { accountId } = c.get("auth");
  const body = await c.req.json<{ invoice_id: number; action: "include" | "exclude" | "clear" }>();
  if (!body?.invoice_id || !["include", "exclude", "clear"].includes(body.action)) {
    return c.json({ error: "invoice_id and action (include | exclude | clear) are required" }, 400);
  }
  const inv = await c.env.DB.prepare("SELECT id FROM invoices WHERE id = ? AND account_id = ?").bind(body.invoice_id, accountId).first();
  if (!inv) return c.json({ error: "Invoice not found" }, 404);
  const locked = await c.env.DB
    .prepare("SELECT 1 FROM gst_iff_documents WHERE account_id = ? AND doc_type = 'invoice' AND doc_id = ?")
    .bind(accountId, body.invoice_id)
    .first();
  if (locked) return c.json({ error: "This invoice is already part of a filed IFF. Unmark that IFF first." }, 409);

  if (body.action === "clear") {
    await c.env.DB.prepare("DELETE FROM gst_invoice_overrides WHERE account_id = ? AND invoice_id = ?").bind(accountId, body.invoice_id).run();
  } else {
    await c.env.DB
      .prepare(
        `INSERT INTO gst_invoice_overrides (account_id, invoice_id, action) VALUES (?, ?, ?)
         ON CONFLICT(account_id, invoice_id) DO UPDATE SET action = excluded.action, updated_at = datetime('now')`
      )
      .bind(accountId, body.invoice_id, body.action)
      .run();
  }
  return c.json({ ok: true });
});

/** IFF for month 1 or 2: B2B invoices only. */
gstFiling.get("/iff", async (c) => {
  const { accountId } = c.get("auth");
  const qp = parseQuarter(c);
  const period = c.req.query("period");
  if (!qp || !period || !qp.months.slice(0, 2).includes(period)) {
    return c.json({ error: "IFF can only be furnished for the 1st or 2nd month of a quarter (fy, q, period)" }, 400);
  }
  const loaded = await loadMonths(c.env.DB, accountId, qp.months);
  const filings = await loadFilings(c.env.DB, accountId);
  const filing = findFiling(filings, "IFF", period);

  const monthDocs = loaded.docs.filter((d) => d.included && d.month === period && d.isB2B);
  // After the IFF is filed, show the frozen set; before, show the pending set.
  const docs = filing ? monthDocs.filter((d) => d.in_iff === period) : monthDocs.filter((d) => !d.in_iff);

  const rows = docs.flatMap(docRows);
  const monthWarnings = unreceiptedWarnings(loaded.docs.filter((d) => d.month === period));
  const b2cSkipped = loaded.docs.filter((d) => d.included && d.month === period && !d.isB2B);

  return c.json({
    period,
    label: monthLabel(period),
    portal_year: portalYear(qp.fy),
    due: nextMonthDate(period, 13),
    filing,
    company: loaded.company,
    invoices: docs.map((d) => ({
      id: d.id,
      doc_number: d.doc_number,
      issue_date: d.issue_date,
      customer_name: d.customer_name,
      customer_gstin: d.customer_gstin,
      place_of_supply: d.place_of_supply,
      place_of_supply_name: posName(d.place_of_supply),
      invoice_value: d.grand_total,
      receipted: d.receipted,
      override: d.override,
      rates: Array.from(d.byRate.entries()).map(([rate, l]) => ({ rate, ...l })),
    })),
    rows,
    totals: docTotals(docs),
    exceptions: exceptionsFor(docs, loaded.home),
    unreceipted_in_month: monthWarnings,
    b2c_left_for_gstr1: docTotals(b2cSkipped),
    notes: [
      "IFF carries B2B invoices only. B2C sales are reported in the quarterly GSTR-1 (Table 7).",
      "Invoices furnished here are NOT repeated in the quarterly GSTR-1 Tables 4A / 7, but they still appear in Table 12 (HSN summary).",
      "No IFF is mandatory. Skipping it only means the recipient claims ITC a month later.",
    ],
  });
});

/** Quarterly GSTR-1. */
gstFiling.get("/gstr1", async (c) => {
  const { accountId } = c.get("auth");
  const qp = parseQuarter(c);
  if (!qp) return c.json({ error: "fy (start year) and q (1-4) are required" }, 400);
  const loaded = await loadMonths(c.env.DB, accountId, qp.months);
  const filings = await loadFilings(c.env.DB, accountId);
  const home = loaded.home;

  const included = loaded.docs.filter((d) => d.included);
  const fresh = included.filter((d) => !d.in_iff); // not already furnished in IFF
  const viaIff = included.filter((d) => !!d.in_iff);

  const b2bDocs = fresh.filter((d) => d.isB2B);
  const b2cDocs = fresh.filter((d) => !d.isB2B);
  const isInter = (d: SupplyDoc) => !!(home && d.place_of_supply && home !== d.place_of_supply);
  const b2clDocs = b2cDocs.filter((d) => isInter(d) && d.grand_total > B2C_LARGE_THRESHOLD);
  const b2csDocs = b2cDocs.filter((d) => !b2clDocs.includes(d));

  const b2csMap = new Map<string, any>();
  for (const d of b2csDocs) {
    for (const [rate, line] of d.byRate) {
      const pos = d.place_of_supply || home || "";
      const key = `${pos}::${rate}`;
      const ex = b2csMap.get(key) || { place_of_supply: pos, place_of_supply_name: posName(pos), rate, supply_type: isInter(d) ? "Inter-State" : "Intra-State", ...emptyLine() };
      b2csMap.set(key, { ...ex, ...addLine(ex, line) });
    }
  }

  const hsnB2B = hsnWithTax(included.filter((d) => d.isB2B), home);
  const hsnB2C = hsnWithTax(included.filter((d) => !d.isB2B), home);

  const all = docTotals(included);
  const exceptions = exceptionsFor(included, home);
  const warnings = unreceiptedWarnings(loaded.docs);
  if (warnings.length)
    exceptions.push({ level: "amber", text: `${warnings.length} issued invoice(s) are not receipted and not included. GST may still be due on the supply — review them.` });
  if (loaded.draftCount) exceptions.push({ level: "amber", text: `${loaded.draftCount} draft invoice(s) dated in this quarter are ignored.` });

  const docsIssued = documentsIssued(loaded.invoiceNumbers);
  for (const r of docsIssued)
    if (r.missing_numbers.length)
      exceptions.push({ level: "amber", text: `Numbering gap in invoice series: ${r.missing_numbers.join(", ")} not found (deleted, draft, or outside this quarter) — Table 13 counts only what exists.` });

  const hsnCheck = round2(hsnB2B.concat(hsnB2C).reduce((s, r) => s + r.taxable_value, 0));
  if (hsnCheck !== all.taxable_value)
    exceptions.push({ level: "red", text: `Table 12 taxable total ${hsnCheck} does not equal the quarter total ${all.taxable_value}.` });

  const t4a = docTotals(b2bDocs);
  const t5 = docTotals(b2clDocs);
  const t7 = docTotals(b2csDocs);
  const tIff = docTotals(viaIff);

  return c.json({
    quarter: qp.key,
    label: `${monthLabel(qp.months[0])} – ${monthLabel(qp.months[2])}`,
    portal_year: portalYear(qp.fy),
    due: nextMonthDate(qp.months[2], 13),
    filing: findFiling(filings, "GSTR1", qp.key),
    company: loaded.company,
    tables: {
      "4A": { title: "B2B Regular", rows: b2bDocs.flatMap(docRows), totals: t4a },
      "5": { title: "B2C Large (inter-state)", rows: b2clDocs.flatMap(docRows), totals: t5 },
      "7": { title: "B2C Others (state-wise, rate-wise)", rows: Array.from(b2csMap.values()), totals: t7 },
      "12B2B": { title: "HSN summary — B2B tab", rows: hsnB2B },
      "12B2C": { title: "HSN summary — B2C tab", rows: hsnB2C },
      "13": { title: "Documents issued", rows: docsIssued },
    },
    already_in_iff: {
      documents: viaIff.map((d) => ({ doc_number: d.doc_number, issue_date: d.issue_date, customer_name: d.customer_name, iff_period: d.in_iff, taxable_value: docTotals([d]).taxable_value })),
      totals: tIff,
    },
    reconciliation: {
      quarter_total: all,
      in_iff: tIff,
      in_this_gstr1: addLine(addLine(t4a, t5), t7),
      note: "Quarter total = IFF-furnished + what you enter in 4A/5/7. The portal's Total Liability on the GSTR-1 summary will show only the part entered in this return.",
    },
    exceptions,
    status: exceptions.some((e) => e.level === "red") ? "RED" : exceptions.length ? "AMBER" : "GREEN",
    overrides: overrideRows(loaded.docs),
  });
});

/** Quarterly GSTR-3B. */
gstFiling.get("/gstr3b", async (c) => {
  const { accountId } = c.get("auth");
  const qp = parseQuarter(c);
  if (!qp) return c.json({ error: "fy (start year) and q (1-4) are required" }, 400);
  const loaded = await loadMonths(c.env.DB, accountId, qp.months);
  const filings = await loadFilings(c.env.DB, accountId);

  const included = loaded.docs.filter((d) => d.included);
  const out = docTotals(included);

  const inputs =
    (await c.env.DB.prepare("SELECT * FROM gst_3b_inputs WHERE account_id = ? AND quarter = ?").bind(accountId, qp.key).first<any>()) || {
      itc_igst: 0,
      itc_cgst: 0,
      itc_sgst: 0,
      interest: 0,
      late_fee: 0,
      notes: null,
    };
  const { results: payments } = await c.env.DB
    .prepare("SELECT id, quarter, paid_on, igst, cgst, sgst, reference FROM gst_payments WHERE account_id = ? ORDER BY paid_on ASC, id ASC")
    .bind(accountId)
    .all<any>();
  const qPayments = (payments ?? []).filter((p) => p.quarter === qp.key);
  const paid = qPayments.reduce(
    (a, p) => ({ igst: round2(a.igst + p.igst), cgst: round2(a.cgst + p.cgst), sgst: round2(a.sgst + p.sgst) }),
    { igst: 0, cgst: 0, sgst: 0 }
  );

  // ITC set-off (Section 49): IGST credit first against IGST, then CGST, then SGST;
  // CGST credit against CGST (then IGST); SGST credit against SGST (then IGST).
  let igstL = out.igst, cgstL = out.cgst, sgstL = out.sgst;
  let iCr = inputs.itc_igst, cCr = inputs.itc_cgst, sCr = inputs.itc_sgst;
  const take = (liab: number, cr: number) => { const u = Math.min(liab, cr); return [round2(liab - u), round2(cr - u)] as const; };
  [igstL, iCr] = take(igstL, iCr);
  [cgstL, iCr] = take(cgstL, iCr);
  [sgstL, iCr] = take(sgstL, iCr);
  [cgstL, cCr] = take(cgstL, cCr);
  [igstL, cCr] = take(igstL, cCr);
  [sgstL, sCr] = take(sgstL, sCr);
  [igstL, sCr] = take(igstL, sCr);
  const afterItc = { igst: igstL, cgst: cgstL, sgst: sgstL, total: round2(igstL + cgstL + sgstL) };
  const cashDue = {
    igst: Math.max(round2(afterItc.igst - paid.igst), 0),
    cgst: Math.max(round2(afterItc.cgst - paid.cgst), 0),
    sgst: Math.max(round2(afterItc.sgst - paid.sgst), 0),
  };
  const excessPaid = {
    igst: Math.max(round2(paid.igst - afterItc.igst), 0),
    cgst: Math.max(round2(paid.cgst - afterItc.cgst), 0),
    sgst: Math.max(round2(paid.sgst - afterItc.sgst), 0),
  };

  const exceptions = exceptionsFor(included, loaded.home);
  const warnings = unreceiptedWarnings(loaded.docs);
  if (warnings.length) exceptions.push({ level: "amber", text: `${warnings.length} issued invoice(s) not receipted and not included in 3.1(a).` });
  if (!inputs.itc_igst && !inputs.itc_cgst && !inputs.itc_sgst)
    exceptions.push({ level: "amber", text: "ITC is 0. Enter the eligible ITC from GSTR-2B (available after the 14th of the month after quarter end) — otherwise tax payable is overstated." });
  if (!loaded.company.gstin) exceptions.push({ level: "red", text: "Company GSTIN is missing in the company profile." });

  const g1 = findFiling(filings, "GSTR1", qp.key);
  if (!g1) exceptions.push({ level: "red", text: "GSTR-1 for this quarter is not marked filed. File GSTR-1 first — 3B should agree with it." });

  const interestAndFee = round2(inputs.interest + inputs.late_fee);
  return c.json({
    quarter: qp.key,
    label: `${monthLabel(qp.months[0])} – ${monthLabel(qp.months[2])}`,
    portal_year: portalYear(qp.fy),
    due: nextMonthDate(qp.months[2], 22),
    filing: findFiling(filings, "GSTR3B", qp.key),
    company: loaded.company,
    outward_3_1_a: { taxable_value: out.taxable_value, igst: out.igst, cgst: out.cgst, sgst: out.sgst, cess: 0, total_tax: round2(out.igst + out.cgst + out.sgst), document_count: out.count },
    itc_input: inputs,
    tax_after_itc: afterItc,
    payments: qPayments,
    paid_so_far: paid,
    cash_due: { ...cashDue, total: round2(cashDue.igst + cashDue.cgst + cashDue.sgst) },
    excess_cash_ledger_use: excessPaid,
    interest: inputs.interest,
    late_fee: inputs.late_fee,
    total_cash_to_pay: round2(cashDue.igst + cashDue.cgst + cashDue.sgst + interestAndFee),
    gstr1_filed: !!g1,
    exceptions,
    status: exceptions.some((e) => e.level === "red") ? "RED" : exceptions.length ? "AMBER" : "GREEN",
    note: "Cash due = tax after ITC − tax already deposited by PMT-06 for this quarter. The portal's system-generated figures prevail. Use the cash ledger balance shown on the portal (Create Challan / Electronic Cash Ledger) to confirm you need to deposit the difference.",
  });
});

// ---------- manual inputs / tracker -------------------------------------

gstFiling.put("/3b-inputs", async (c) => {
  const { accountId } = c.get("auth");
  const b = await c.req.json<any>();
  if (!/^\d{4}-Q[1-4]$/.test(b?.quarter || "")) return c.json({ error: "quarter (e.g. 2026-Q2) is required" }, 400);
  const n = (v: any) => Math.max(round2(Number(v) || 0), 0);
  await c.env.DB
    .prepare(
      `INSERT INTO gst_3b_inputs (account_id, quarter, itc_igst, itc_cgst, itc_sgst, interest, late_fee, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, quarter) DO UPDATE SET itc_igst = excluded.itc_igst, itc_cgst = excluded.itc_cgst,
         itc_sgst = excluded.itc_sgst, interest = excluded.interest, late_fee = excluded.late_fee, notes = excluded.notes`
    )
    .bind(accountId, b.quarter, n(b.itc_igst), n(b.itc_cgst), n(b.itc_sgst), n(b.interest), n(b.late_fee), b.notes ?? null)
    .run();
  return c.json({ ok: true });
});

gstFiling.post("/payments", async (c) => {
  const { accountId } = c.get("auth");
  const b = await c.req.json<any>();
  if (!/^\d{4}-Q[1-4]$/.test(b?.quarter || "")) return c.json({ error: "quarter (e.g. 2026-Q2) is required" }, 400);
  const n = (v: any) => Math.max(round2(Number(v) || 0), 0);
  if (n(b.igst) + n(b.cgst) + n(b.sgst) <= 0) return c.json({ error: "Enter an amount for at least one of IGST / CGST / SGST" }, 400);
  await c.env.DB
    .prepare("INSERT INTO gst_payments (account_id, quarter, paid_on, igst, cgst, sgst, reference) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(accountId, b.quarter, b.paid_on ?? null, n(b.igst), n(b.cgst), n(b.sgst), b.reference ?? null)
    .run();
  return c.json({ ok: true }, 201);
});

gstFiling.delete("/payments/:id", async (c) => {
  const { accountId } = c.get("auth");
  await c.env.DB.prepare("DELETE FROM gst_payments WHERE id = ? AND account_id = ?").bind(c.req.param("id"), accountId).run();
  return c.json({ ok: true });
});

/** Record that a return was filed on the portal (ARN + date). For an IFF this also freezes its documents. */
gstFiling.post("/filings", async (c) => {
  const { accountId } = c.get("auth");
  const b = await c.req.json<{ return_type: "IFF" | "GSTR1" | "GSTR3B"; period: string; arn?: string; filed_on?: string; notes?: string; fy?: number; q?: number }>();
  if (!["IFF", "GSTR1", "GSTR3B"].includes(b?.return_type)) return c.json({ error: "return_type must be IFF, GSTR1 or GSTR3B" }, 400);
  const periodOk = b.return_type === "IFF" ? /^\d{4}-\d{2}$/.test(b.period || "") : /^\d{4}-Q[1-4]$/.test(b.period || "");
  if (!periodOk) return c.json({ error: "period is malformed" }, 400);
  if (!b.arn || !b.filed_on) return c.json({ error: "ARN and filing date are required" }, 400);

  if (b.return_type === "IFF") {
    const month = b.period;
    const fyStart = Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;
    const q = Math.floor(((Number(month.slice(5, 7)) + 8) % 12) / 3) + 1;
    const months = quarterMonths(fyStart, q);
    if (!months.slice(0, 2).includes(month)) return c.json({ error: "IFF applies to month 1 or 2 of a quarter only" }, 400);
    const loaded = await loadMonths(c.env.DB, accountId, months);
    const docs = loaded.docs.filter((d) => d.included && d.month === month && d.isB2B && !d.in_iff);
    const stmts = docs.map((d) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO gst_iff_documents (account_id, period, doc_type, doc_id) VALUES (?, ?, ?, ?)").bind(accountId, month, d.doc_type, d.id)
    );
    if (stmts.length) await c.env.DB.batch(stmts);
  }

  await c.env.DB
    .prepare(
      `INSERT INTO gst_filings (account_id, return_type, period, arn, filed_on, notes) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, return_type, period) DO UPDATE SET arn = excluded.arn, filed_on = excluded.filed_on, notes = excluded.notes`
    )
    .bind(accountId, b.return_type, b.period, b.arn.trim(), b.filed_on, b.notes ?? null)
    .run();
  return c.json({ ok: true }, 201);
});

gstFiling.delete("/filings", async (c) => {
  const { accountId } = c.get("auth");
  const type = c.req.query("return_type");
  const period = c.req.query("period");
  if (!type || !period) return c.json({ error: "return_type and period are required" }, 400);
  if (type === "IFF") {
    await c.env.DB.prepare("DELETE FROM gst_iff_documents WHERE account_id = ? AND period = ?").bind(accountId, period).run();
  }
  await c.env.DB.prepare("DELETE FROM gst_filings WHERE account_id = ? AND return_type = ? AND period = ?").bind(accountId, type, period).run();
  return c.json({ ok: true });
});

/**
 * Mark an invoice as already furnished in an IFF that was filed outside Rizipt
 * (before this feature existed), so the quarterly GSTR-1 does not repeat it.
 */
gstFiling.post("/iff-documents", async (c) => {
  const { accountId } = c.get("auth");
  const b = await c.req.json<{ invoice_id: number; period: string; remove?: boolean }>();
  if (!b?.invoice_id || !/^\d{4}-\d{2}$/.test(b.period || "")) return c.json({ error: "invoice_id and period (YYYY-MM) are required" }, 400);
  if (b.remove) {
    await c.env.DB.prepare("DELETE FROM gst_iff_documents WHERE account_id = ? AND doc_type = 'invoice' AND doc_id = ?").bind(accountId, b.invoice_id).run();
  } else {
    await c.env.DB
      .prepare("INSERT OR REPLACE INTO gst_iff_documents (account_id, period, doc_type, doc_id) VALUES (?, ?, 'invoice', ?)")
      .bind(accountId, b.period, b.invoice_id)
      .run();
  }
  return c.json({ ok: true });
});

/** Whole-year tracker for the compliance table. */
gstFiling.get("/tracker", async (c) => {
  const { accountId } = c.get("auth");
  const filings = await loadFilings(c.env.DB, accountId);
  return c.json({ filings });
});
