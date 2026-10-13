import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { money } from "../components/ItemsEditor.jsx";

/* ------------------------------------------------------------------ *
 * GST Filing — QRMP route
 *  Month 1 & 2: optional IFF (B2B only)
 *  Quarter    : GSTR-1, then GSTR-3B (+ monthly PMT-06 payments)
 * Every number the portal asks for is shown with a Copy button, in the
 * order the portal asks for it.
 * ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);
const portalDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const num = (v) => (Number(v) || 0).toFixed(2);

function currentFyQuarter() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const fy = m >= 4 ? y : y - 1;
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  return { fy, q };
}

const STATUS_STYLE = {
  GREEN: "bg-ledger-green/10 text-ledger-green",
  AMBER: "bg-amber-100 text-amber-800",
  RED: "bg-ledger-red/10 text-ledger-red",
};

function Copy({ value, label }) {
  const [done, setDone] = useState(false);
  const text = String(value ?? "");
  return (
    <button
      type="button"
      title="Copy"
      className="ml-1 rounded border border-paper-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft hover:border-ink/40 hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Copied" : label || "Copy"}
    </button>
  );
}

/** A "field on the portal = value" pair with copy. */
function Field({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-paper-line py-1.5 first:border-t-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="flex items-center">
        <span className={`text-sm text-ink ${mono ? "font-mono" : ""}`}>{value === "" || value == null ? "—" : value}</span>
        {value !== "" && value != null && <Copy value={value} />}
      </span>
    </div>
  );
}

function Pill({ status }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] || ""}`}>{status}</span>;
}

/** Ordered list of portal clicks. */
function Route({ title, steps }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 font-display text-sm font-semibold text-ink">{title}</h3>
      <ol className="space-y-2 text-sm text-ink">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-ink text-[11px] text-paper">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Exceptions({ items }) {
  if (!items?.length) return <div className="rounded-md bg-ledger-green/10 px-4 py-2 text-sm text-ledger-green">No exceptions found.</div>;
  return (
    <div className="card p-4">
      <h3 className="mb-2 font-display text-sm font-semibold text-ink">Exceptions to review</h3>
      <ul className="space-y-1 text-sm">
        {items.map((e, i) => (
          <li key={i} className={e.level === "red" ? "text-ledger-red" : "text-amber-800"}>
            {e.level === "red" ? "● " : "○ "}
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ title, columns, rows, empty, footer }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-paper-line px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-semibold ${c.right ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-paper-line">
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.right ? "text-right font-mono" : ""}`}>
                    {c.render ? c.render(r) : r[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-5 text-center text-ink-soft">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-paper-line bg-paper px-4 py-2 text-xs text-ink-soft">{footer}</div>}
    </div>
  );
}

const m2 = (v) => (v == null ? "—" : money(v));

/** ARN + date capture, which is what drives the status shown on the overview. */
function FiledBox({ returnType, period, filing, onChange, extraNote }) {
  const [arn, setArn] = useState("");
  const [filedOn, setFiledOn] = useState(today());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (filing) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 border-ledger-green/40 p-4">
        <div className="text-sm">
          <span className="font-semibold text-ledger-green">Filed</span> on {portalDate(filing.filed_on)} · ARN{" "}
          <span className="font-mono">{filing.arn}</span>
          <Copy value={filing.arn} />
        </div>
        <button
          className="btn-secondary"
          onClick={async () => {
            if (!window.confirm("Remove the filed record? This does not change anything on the GST portal.")) return;
            await api.gstUnmarkFiled(returnType, period);
            onChange();
          }}
        >
          Undo record
        </button>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <h3 className="mb-1 font-display text-sm font-semibold text-ink">After you file on the portal</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Rizipt never files for you. Once the portal shows the ARN, record it here so this return is marked done.
        {extraNote ? ` ${extraNote}` : ""}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">ARN</label>
          <input className="field-input" value={arn} onChange={(e) => setArn(e.target.value)} placeholder="AA330926908327Y" />
        </div>
        <div>
          <label className="field-label">Filed on</label>
          <input type="date" className="field-input" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setErr("");
            setBusy(true);
            try {
              await api.gstMarkFiled({ return_type: returnType, period, arn, filed_on: filedOn });
              onChange();
            } catch (e) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Record as filed
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-ledger-red">{err}</p>}
    </div>
  );
}

/* ------------------------------ Review ----------------------------- */

function ReviewPanel({ fy, q, onChange }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.gstReview(fy, q).then(setData).catch((e) => setErr(e.message)), [fy, q]);
  useEffect(() => {
    load();
  }, [load]);

  const set = async (id, action) => {
    try {
      await api.gstSetOverride(id, action);
      await load();
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!data) return <p className="text-sm text-ink-soft">{err || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-display text-base font-semibold text-ink">Which invoices count?</h3>
        <p className="mt-1 text-sm text-ink-soft">
          By default an invoice counts for GST once you convert it to a Bill/Receipt. Draft, rejected and void invoices never count.
          Below are invoices that were issued but not receipted yet. {data.note}
        </p>
        {err && <p className="mt-2 text-sm text-ledger-red">{err}</p>}
      </div>
      <DataTable
        title={`Issued but not receipted (${data.unreceipted.length})`}
        rows={data.unreceipted}
        empty="Nothing waiting — every issued invoice is receipted."
        columns={[
          { key: "doc_number", label: "Invoice" },
          { key: "issue_date", label: "Date" },
          { key: "customer_name", label: "Customer" },
          { key: "status", label: "Status" },
          { key: "taxable_value", label: "Taxable", right: true, render: (r) => m2(r.taxable_value) },
          { key: "tax", label: "GST", right: true, render: (r) => m2(r.cgst + r.sgst + r.igst) },
          {
            key: "counts",
            label: "Counted?",
            render: (r) => (r.included ? <span className="font-semibold text-ledger-green">Included</span> : <span className="text-ink-soft">Not counted</span>),
          },
          {
            key: "act",
            label: "",
            render: (r) =>
              r.override === "include" ? (
                <button className="btn-secondary" onClick={() => set(r.id, "clear")}>Undo include</button>
              ) : (
                <button className="btn-primary" onClick={() => set(r.id, "include")}>Include in GST</button>
              ),
          },
        ]}
      />
      {data.overridden_receipted.length > 0 && (
        <DataTable
          title="Receipted but excluded by you"
          rows={data.overridden_receipted}
          empty=""
          columns={[
            { key: "doc_number", label: "Invoice" },
            { key: "issue_date", label: "Date" },
            { key: "customer_name", label: "Customer" },
            { key: "grand_total", label: "Total", right: true, render: (r) => m2(r.grand_total) },
            { key: "act", label: "", render: (r) => <button className="btn-secondary" onClick={() => set(r.id, "clear")}>Count it again</button> },
          ]}
        />
      )}
      {data.draft_count > 0 && <p className="text-xs text-amber-800">{data.draft_count} draft invoice(s) in this quarter are ignored.</p>}
    </div>
  );
}

/* -------------------------------- IFF ------------------------------ */

function IffView({ fy, q, period, refresh }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.gstIff(fy, q, period).then(setD).catch((e) => setErr(e.message)), [fy, q, period]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const done = () => {
    load();
    refresh();
  };
  if (!d) return <p className="text-sm text-ink-soft">{err || "Loading…"}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">IFF — {d.label}</h2>
        <span className="text-sm text-ink-soft">Statutory due: {portalDate(d.due)} (confirm on portal)</span>
      </div>

      <Route
        title="Route on the GST portal"
        steps={[
          <>Log in at gst.gov.in → <b>Services → Returns → Returns Dashboard</b>.</>,
          <>Financial Year <b>{d.portal_year}</b>, Quarter, Period <b>{d.label}</b> → <b>Search</b>.</>,
          <>On the <b>IFF</b> tile click <b>Prepare Online</b> (not Offline).</>,
          <>Open <b>4A – B2B Invoices</b> → <b>Add Record</b>. Enter each invoice below (one row per invoice; if an invoice has several rates add one item per rate).</>,
          <>Come back to the IFF page → <b>Generate summary</b> → check the totals match the box below → <b>Preview</b> → <b>File</b> with EVC/DSC.</>,
          <>Copy the ARN into Rizipt (box at the bottom).</>,
        ]}
      />

      {d.invoices.length === 0 ? (
        <div className="card p-5 text-sm text-ink-soft">No B2B invoices to report for this month, so there is nothing to put in an IFF. You can skip it — these sales are reported in the quarterly GSTR-1.</div>
      ) : (
        d.invoices.map((inv) => (
          <div key={inv.id} className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink">
                {inv.doc_number} — {inv.customer_name}
              </h3>
              {!inv.receipted && <span className="text-xs text-amber-800">Not receipted — counted because you included it</span>}
            </div>
            <Field label="Recipient GSTIN" value={inv.customer_gstin} />
            <Field label="Invoice number" value={inv.doc_number} />
            <Field label="Invoice date (dd/mm/yyyy)" value={portalDate(inv.issue_date)} />
            <Field label="Invoice value" value={num(inv.invoice_value)} />
            <Field label="Place of supply" value={inv.place_of_supply ? `${inv.place_of_supply}-${inv.place_of_supply_name}` : ""} mono={false} />
            {inv.rates.map((r) => (
              <div key={r.rate} className="mt-2 rounded-md bg-paper p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Item — {r.rate}%</div>
                <Field label="Rate (%)" value={r.rate} />
                <Field label="Taxable value" value={num(r.taxable_value)} />
                {r.igst > 0 ? (
                  <Field label="Integrated tax" value={num(r.igst)} />
                ) : (
                  <>
                    <Field label="Central tax" value={num(r.cgst)} />
                    <Field label="State/UT tax" value={num(r.sgst)} />
                  </>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      <div className="card p-5">
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Expected IFF summary (must match the portal)</h3>
        <Field label="Invoices" value={d.totals.count} />
        <Field label="Taxable value" value={num(d.totals.taxable_value)} />
        <Field label="Integrated tax" value={num(d.totals.igst)} />
        <Field label="Central tax" value={num(d.totals.cgst)} />
        <Field label="State/UT tax" value={num(d.totals.sgst)} />
      </div>

      <Exceptions items={d.exceptions} />
      {d.unreceipted_in_month.length > 0 && (
        <div className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">
          {d.unreceipted_in_month.length} issued invoice(s) in {d.label} are not receipted and not included (see the “Which invoices count?” tab).
        </div>
      )}
      <ul className="list-disc space-y-1 pl-5 text-xs text-ink-soft">
        {d.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>

      <FiledBox
        returnType="IFF"
        period={period}
        filing={d.filing}
        onChange={done}
        extraNote="Recording the IFF as filed marks these invoices so the quarterly GSTR-1 will not repeat them in 4A."
      />
    </div>
  );
}

/* ------------------------------ GSTR-1 ----------------------------- */

const taxCols = [
  { key: "taxable_value", label: "Taxable", right: true, render: (r) => num(r.taxable_value) },
  { key: "igst", label: "IGST", right: true, render: (r) => num(r.igst) },
  { key: "cgst", label: "CGST", right: true, render: (r) => num(r.cgst) },
  { key: "sgst", label: "SGST", right: true, render: (r) => num(r.sgst) },
];

function Gstr1View({ fy, q, refresh }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.gstQ1(fy, q).then(setD).catch((e) => setErr(e.message)), [fy, q]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const done = () => {
    load();
    refresh();
  };
  if (!d) return <p className="text-sm text-ink-soft">{err || "Loading…"}</p>;
  const t = d.tables;
  const rec = d.reconciliation;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">GSTR-1 — {d.label}</h2>
        <div className="flex items-center gap-3">
          <Pill status={d.status} />
          <span className="text-sm text-ink-soft">Statutory due: {portalDate(d.due)} (confirm on portal)</span>
        </div>
      </div>

      <Route
        title="Route on the GST portal"
        steps={[
          <><b>Services → Returns → Returns Dashboard</b> → FY <b>{d.portal_year}</b>, Quarter, Period <b>{d.label}</b> → <b>Search</b>.</>,
          <>On the <b>GSTR-1</b> tile click <b>Prepare Online</b>.</>,
          <><b>Table 4A – B2B</b>: add each invoice from the first table below{t["4A"].rows.length === 0 ? " (none this quarter — skip)" : ""}.</>,
          <><b>Table 5 – B2C Large</b>: only if the table below has rows.</>,
          <><b>Table 7 – B2C Others</b>: add the state-wise rows below (no customer details).</>,
          <><b>Table 12 – HSN</b>: fill both the <b>B2B</b> and <b>B2C</b> tabs, with <i>all</i> sales of the quarter including those already furnished in IFF.</>,
          <><b>Table 13 – Documents issued</b>: add the series below. Cancelled numbers are counted in Total and Cancelled.</>,
          <><b>Generate Summary</b> → compare with the reconciliation box → <b>Proceed to file</b> → EVC/DSC. Then record the ARN below.</>,
        ]}
      />

      <div className="card p-5">
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Reconciliation — what the portal summary should show</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="py-1">Part</th>
                <th className="text-right">Docs</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">CGST</th>
                <th className="text-right">SGST</th>
                <th className="text-right">IGST</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {[
                ["Furnished earlier through IFF", rec.in_iff],
                ["Entered in this GSTR-1 (4A + 5 + 7)", rec.in_this_gstr1],
                ["Whole quarter", rec.quarter_total],
              ].map(([label, r], i) => (
                <tr key={i} className={`border-t border-paper-line ${i === 2 ? "font-semibold" : ""}`}>
                  <td className="py-1.5 font-sans">{label}</td>
                  <td className="text-right">{r.count ?? "—"}</td>
                  <td className="text-right">{num(r.taxable_value)}</td>
                  <td className="text-right">{num(r.cgst)}</td>
                  <td className="text-right">{num(r.sgst)}</td>
                  <td className="text-right">{num(r.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{rec.note}</p>
      </div>

      <DataTable
        title={`Table 4A — B2B (${t["4A"].rows.length}) · ${num(t["4A"].totals.taxable_value)} taxable`}
        rows={t["4A"].rows}
        empty="No B2B invoices left to report (they were all furnished in IFF, or there are none)."
        columns={[
          { key: "customer_gstin", label: "Recipient GSTIN", render: (r) => <>{r.customer_gstin}<Copy value={r.customer_gstin} /></> },
          { key: "doc_number", label: "Invoice no.", render: (r) => <>{r.doc_number}<Copy value={r.doc_number} /></> },
          { key: "issue_date", label: "Date", render: (r) => portalDate(r.issue_date) },
          { key: "invoice_value", label: "Inv. value", right: true, render: (r) => num(r.invoice_value) },
          { key: "place_of_supply", label: "POS", render: (r) => r.place_of_supply || "—" },
          { key: "rate", label: "Rate", right: true, render: (r) => `${r.rate}%` },
          ...taxCols,
        ]}
      />

      {t["5"].rows.length > 0 && (
        <DataTable
          title="Table 5 — B2C Large"
          rows={t["5"].rows}
          empty=""
          columns={[
            { key: "doc_number", label: "Invoice no." },
            { key: "issue_date", label: "Date", render: (r) => portalDate(r.issue_date) },
            { key: "invoice_value", label: "Inv. value", right: true, render: (r) => num(r.invoice_value) },
            { key: "place_of_supply_name", label: "POS" },
            { key: "rate", label: "Rate", right: true, render: (r) => `${r.rate}%` },
            ...taxCols,
          ]}
        />
      )}

      <DataTable
        title={`Table 7 — B2C Others (${t["7"].rows.length}) · ${num(t["7"].totals.taxable_value)} taxable`}
        rows={t["7"].rows}
        empty="No B2C sales this quarter."
        columns={[
          { key: "type", label: "Type", render: (r) => r.supply_type },
          { key: "place_of_supply_name", label: "Place of supply", render: (r) => `${r.place_of_supply}-${r.place_of_supply_name}` },
          { key: "rate", label: "Rate", right: true, render: (r) => `${r.rate}%` },
          { key: "taxable_value", label: "Taxable", right: true, render: (r) => <>{num(r.taxable_value)}<Copy value={num(r.taxable_value)} /></> },
          { key: "cgst", label: "CGST", right: true, render: (r) => num(r.cgst) },
          { key: "sgst", label: "SGST", right: true, render: (r) => num(r.sgst) },
          { key: "igst", label: "IGST", right: true, render: (r) => num(r.igst) },
        ]}
      />

      {["12B2B", "12B2C"].map((k) => (
        <DataTable
          key={k}
          title={`Table 12 — HSN, ${k === "12B2B" ? "B2B" : "B2C"} tab`}
          rows={t[k].rows}
          empty={`Nothing in the ${k === "12B2B" ? "B2B" : "B2C"} tab.`}
          columns={[
            { key: "hsn_sac", label: "HSN/SAC", render: (r) => <>{r.hsn_sac || "MISSING"}<Copy value={r.hsn_sac} /></> },
            { key: "uqc", label: "UQC" },
            { key: "quantity", label: "Qty", right: true },
            { key: "rate", label: "Rate", right: true, render: (r) => `${r.rate}%` },
            { key: "total_value", label: "Total value", right: true, render: (r) => num(r.total_value) },
            ...taxCols,
          ]}
        />
      ))}

      <DataTable
        title="Table 13 — Documents issued"
        rows={t["13"].rows}
        empty="No invoices issued this quarter."
        columns={[
          { key: "nature", label: "Nature of document" },
          { key: "from", label: "Sr. no. from", render: (r) => <>{r.from}<Copy value={r.from} /></> },
          { key: "to", label: "Sr. no. to", render: (r) => <>{r.to}<Copy value={r.to} /></> },
          { key: "total_number", label: "Total number", right: true },
          { key: "cancelled", label: "Cancelled", right: true },
          { key: "net_issued", label: "Net issued", right: true },
        ]}
        footer="Drafts are never counted as issued. Numbers missing from a series (listed under Exceptions) are not counted — confirm they were never issued."
      />

      {d.already_in_iff.documents.length > 0 && (
        <DataTable
          title="Already furnished in IFF (do NOT re-enter in 4A / 7)"
          rows={d.already_in_iff.documents}
          empty=""
          columns={[
            { key: "doc_number", label: "Invoice" },
            { key: "customer_name", label: "Customer" },
            { key: "iff_period", label: "IFF month" },
            { key: "taxable_value", label: "Taxable", right: true, render: (r) => num(r.taxable_value) },
          ]}
        />
      )}

      <Exceptions items={d.exceptions} />
      <FiledBox returnType="GSTR1" period={`${fy}-Q${q}`} filing={d.filing} onChange={done} />
    </div>
  );
}

/* ------------------------------ GSTR-3B ---------------------------- */

function NumInput({ label, value, onChange }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type="number" step="0.01" min="0" className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Gstr3bView({ fy, q, refresh }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [inp, setInp] = useState({ itc_igst: "", itc_cgst: "", itc_sgst: "", interest: "", late_fee: "" });
  const [pay, setPay] = useState({ paid_on: today(), cgst: "", sgst: "", igst: "", reference: "" });
  const quarter = `${fy}-Q${q}`;

  const load = useCallback(
    () =>
      api
        .gstQ3b(fy, q)
        .then((r) => {
          setD(r);
          setInp({
            itc_igst: r.itc_input.itc_igst || "",
            itc_cgst: r.itc_input.itc_cgst || "",
            itc_sgst: r.itc_input.itc_sgst || "",
            interest: r.itc_input.interest || "",
            late_fee: r.itc_input.late_fee || "",
          });
        })
        .catch((e) => setErr(e.message)),
    [fy, q]
  );
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  if (!d) return <p className="text-sm text-ink-soft">{err || "Loading…"}</p>;
  const o = d.outward_3_1_a;

  const saveInputs = async () => {
    setErr("");
    try {
      await api.gstSave3bInputs({ quarter, ...inp });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };
  const addPayment = async () => {
    setErr("");
    try {
      await api.gstAddPayment({ quarter, ...pay });
      setPay({ paid_on: today(), cgst: "", sgst: "", igst: "", reference: "" });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">GSTR-3B — {d.label}</h2>
        <div className="flex items-center gap-3">
          <Pill status={d.status} />
          <span className="text-sm text-ink-soft">Statutory due: {portalDate(d.due)} (confirm on portal)</span>
        </div>
      </div>

      <Route
        title="Route on the GST portal"
        steps={[
          <>File GSTR-1 first. Then wait until <b>GSTR-2B</b> for the last month of the quarter is generated (after the 14th).</>,
          <><b>Services → Returns → Returns Dashboard</b> → FY <b>{d.portal_year}</b>, Quarter, Period <b>{d.label}</b> → <b>Search</b> → <b>GSTR-3B → Prepare Online</b>.</>,
          <>Download/read <b>GSTR-2B</b> (Returns Dashboard → GSTR-2B → Download) and type the eligible ITC into the box below.</>,
          <><b>3.1 Outward supplies</b>: row (a) “Outward taxable supplies (other than zero rated, nil rated and exempted)” — copy the values below.</>,
          <><b>4 Eligible ITC</b>: row (A)(5) “All other ITC” — enter ITC from GSTR-2B (ITC available).</>,
          <><b>6.1 Payment of tax</b>: the portal shows liability and ITC. Under “Tax paid through cash”, enter the cash amount from the box below. <b>Make sure the cash ledger covers it</b> (Payments → Create Challan if short).</>,
          <><b>Save → Preview → Proceed to file</b> with EVC/DSC. Record the ARN below.</>,
        ]}
      />

      <div className="card p-5">
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Table 3.1(a) — Outward taxable supplies</h3>
        <Field label="Total taxable value" value={num(o.taxable_value)} />
        <Field label="Integrated tax" value={num(o.igst)} />
        <Field label="Central tax" value={num(o.cgst)} />
        <Field label="State/UT tax" value={num(o.sgst)} />
        <Field label="Cess" value="0.00" />
        <p className="mt-2 text-xs text-ink-soft">From {o.document_count} document(s) in the quarter (including those already furnished in IFF).</p>
      </div>

      <div className="card p-5">
        <h3 className="mb-1 font-display text-sm font-semibold text-ink">Inputs Rizipt cannot know — from GSTR-2B / portal</h3>
        <p className="mb-3 text-xs text-ink-soft">Enter only eligible ITC. If unsure whether an invoice is eligible, leave it out and ask your CA.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <NumInput label="ITC IGST" value={inp.itc_igst} onChange={(v) => setInp({ ...inp, itc_igst: v })} />
          <NumInput label="ITC CGST" value={inp.itc_cgst} onChange={(v) => setInp({ ...inp, itc_cgst: v })} />
          <NumInput label="ITC SGST" value={inp.itc_sgst} onChange={(v) => setInp({ ...inp, itc_sgst: v })} />
          <NumInput label="Interest (portal)" value={inp.interest} onChange={(v) => setInp({ ...inp, interest: v })} />
          <NumInput label="Late fee (portal)" value={inp.late_fee} onChange={(v) => setInp({ ...inp, late_fee: v })} />
        </div>
        <button className="btn-primary mt-3" onClick={saveInputs}>Save inputs</button>
      </div>

      <div className="card p-5">
        <h3 className="mb-1 font-display text-sm font-semibold text-ink">Monthly tax payments (PMT-06) for this quarter</h3>
        <p className="mb-3 text-xs text-ink-soft">Record each challan you paid for months 1 and 2 (due 25th of the following month). The last month of a quarter has no PMT-06.</p>
        <DataTable
          title="Payments"
          rows={d.payments}
          empty="No payments recorded for this quarter."
          columns={[
            { key: "paid_on", label: "Paid on", render: (r) => portalDate(r.paid_on) },
            { key: "cgst", label: "CGST", right: true, render: (r) => num(r.cgst) },
            { key: "sgst", label: "SGST", right: true, render: (r) => num(r.sgst) },
            { key: "igst", label: "IGST", right: true, render: (r) => num(r.igst) },
            { key: "reference", label: "Reference" },
            {
              key: "x",
              label: "",
              render: (r) => (
                <button className="btn-secondary" onClick={async () => { await api.gstDeletePayment(r.id); load(); }}>Delete</button>
              ),
            },
          ]}
        />
        <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-6">
          <div>
            <label className="field-label">Paid on</label>
            <input type="date" className="field-input" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
          </div>
          <NumInput label="CGST" value={pay.cgst} onChange={(v) => setPay({ ...pay, cgst: v })} />
          <NumInput label="SGST" value={pay.sgst} onChange={(v) => setPay({ ...pay, sgst: v })} />
          <NumInput label="IGST" value={pay.igst} onChange={(v) => setPay({ ...pay, igst: v })} />
          <div>
            <label className="field-label">Ref / CPIN</label>
            <input className="field-input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          </div>
          <button className="btn-secondary" onClick={addPayment}>Add payment</button>
        </div>
        {err && <p className="mt-2 text-sm text-ledger-red">{err}</p>}
      </div>

      <div className="card p-5">
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Expected liability and cash to pay</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr><th className="py-1"></th><th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody className="font-mono">
              <tr className="border-t border-paper-line"><td className="py-1.5 font-sans">Output tax (3.1a)</td><td className="text-right">{num(o.igst)}</td><td className="text-right">{num(o.cgst)}</td><td className="text-right">{num(o.sgst)}</td><td className="text-right">{num(o.total_tax)}</td></tr>
              <tr className="border-t border-paper-line"><td className="py-1.5 font-sans">Tax left after ITC</td><td className="text-right">{num(d.tax_after_itc.igst)}</td><td className="text-right">{num(d.tax_after_itc.cgst)}</td><td className="text-right">{num(d.tax_after_itc.sgst)}</td><td className="text-right">{num(d.tax_after_itc.total)}</td></tr>
              <tr className="border-t border-paper-line"><td className="py-1.5 font-sans">Already paid (PMT-06)</td><td className="text-right">{num(d.paid_so_far.igst)}</td><td className="text-right">{num(d.paid_so_far.cgst)}</td><td className="text-right">{num(d.paid_so_far.sgst)}</td><td className="text-right">{num(d.paid_so_far.igst + d.paid_so_far.cgst + d.paid_so_far.sgst)}</td></tr>
              <tr className="border-t border-paper-line font-semibold"><td className="py-1.5 font-sans">Cash still to pay</td><td className="text-right">{num(d.cash_due.igst)}</td><td className="text-right">{num(d.cash_due.cgst)}</td><td className="text-right">{num(d.cash_due.sgst)}</td><td className="text-right">{num(d.cash_due.total)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Interest {num(d.interest)} + late fee {num(d.late_fee)} → total cash needed {money(d.total_cash_to_pay)}. {d.note}
        </p>
      </div>

      <Exceptions items={d.exceptions} />

      <div className={`rounded-md border p-4 ${d.status === "GREEN" ? "border-ledger-green/40" : "border-paper-line"}`}>
        <h3 className="font-display text-sm font-semibold text-ink">FINAL HUMAN APPROVAL REQUIRED</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Status <Pill status={d.status} />. Output tax {money(o.total_tax)} · Cash to pay {money(d.total_cash_to_pay)}. Review these figures against the portal's own
          system-generated GSTR-3B, then submit it yourself with EVC/DSC.
        </p>
      </div>

      <FiledBox returnType="GSTR3B" period={quarter} filing={d.filing} onChange={() => { load(); refresh(); }} />
    </div>
  );
}

/* ------------------------------ Overview --------------------------- */

function Card({ title, sub, due, filing, amount, onOpen, tone }) {
  return (
    <button
      onClick={onOpen}
      className={`card w-full p-4 text-left transition hover:border-ink/40 ${filing ? "border-ledger-green/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-sm font-semibold text-ink">{title}</div>
          <div className="text-xs text-ink-soft">{sub}</div>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${filing ? "bg-ledger-green/10 text-ledger-green" : tone || "bg-paper text-ink-soft"}`}>
          {filing ? "Filed" : "To do"}
        </span>
      </div>
      <div className="mt-3 font-mono text-sm text-ink">{amount}</div>
      <div className="mt-1 text-xs text-ink-soft">{filing ? `ARN ${filing.arn} · ${portalDate(filing.filed_on)}` : due ? `Due ${portalDate(due)}` : ""}</div>
    </button>
  );
}

export default function GstFiling() {
  const cur = currentFyQuarter();
  const [fy, setFy] = useState(cur.fy);
  const [q, setQ] = useState(cur.q);
  const [view, setView] = useState("overview"); // overview | review | iff:YYYY-MM | gstr1 | gstr3b
  const [ov, setOv] = useState(null);
  const [error, setError] = useState("");

  const loadOverview = useCallback(() => {
    setError("");
    return api.gstOverview(fy, q).then(setOv).catch((e) => setError(e.message));
  }, [fy, q]);
  useEffect(() => {
    setOv(null);
    loadOverview();
  }, [loadOverview]);

  const tab = (id, label) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className={`rounded-md border px-3 py-1.5 text-sm ${view === id ? "border-ink bg-ink text-paper" : "border-paper-line bg-white text-ink hover:border-ink/40"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-ink">GST Filing — QRMP</h1>
        <p className="text-sm text-ink-soft">
          Quarterly returns with monthly payment. Figures update automatically when an invoice is converted to a Bill/Receipt. Pick the return, follow the
          portal route, copy the values. Rizipt never logs in or files for you — you authenticate and submit on the GST portal.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Financial year</label>
          <select className="field-input" value={fy} onChange={(e) => { setFy(Number(e.target.value)); setView("overview"); }}>
            {[cur.fy + 1, cur.fy, cur.fy - 1, cur.fy - 2].map((y) => (
              <option key={y} value={y}>{`${y}-${String((y + 1) % 100).padStart(2, "0")}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Quarter</label>
          <select className="field-input" value={q} onChange={(e) => { setQ(Number(e.target.value)); setView("overview"); }}>
            <option value={1}>Q1 · Apr–Jun</option>
            <option value={2}>Q2 · Jul–Sep</option>
            <option value={3}>Q3 · Oct–Dec</option>
            <option value={4}>Q4 · Jan–Mar</option>
          </select>
        </div>
        <Link to="/gst-filing/classic" className="ml-auto text-xs text-ink-soft underline">Classic monthly view</Link>
      </div>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}
      {!ov && !error && <p className="text-sm text-ink-soft">Loading…</p>}

      {ov && (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {tab("overview", "Overview")}
            {tab("review", `Which invoices count?${ov.unreceipted_count ? ` (${ov.unreceipted_count})` : ""}`)}
            {ov.months.filter((m) => m.iff_allowed).map((m) => tab(`iff:${m.period}`, `IFF · ${m.label}`))}
            {tab("gstr1", "GSTR-1")}
            {tab("gstr3b", "GSTR-3B")}
          </div>

          {view === "overview" && (
            <div className="space-y-5">
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-base font-semibold text-ink">{ov.quarter_label}</h2>
                  <span className="text-xs text-ink-soft">{ov.company?.name} · {ov.company?.gstin || "GSTIN not set"}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
                  <div><div className="field-label">Counted invoices</div><div className="font-mono text-ink">{ov.quarter_totals.count}</div></div>
                  <div><div className="field-label">Taxable value</div><div className="font-mono text-ink">{money(ov.quarter_totals.taxable_value)}</div></div>
                  <div><div className="field-label">CGST</div><div className="font-mono text-ink">{money(ov.quarter_totals.cgst)}</div></div>
                  <div><div className="field-label">SGST</div><div className="font-mono text-ink">{money(ov.quarter_totals.sgst)}</div></div>
                  <div><div className="field-label">IGST</div><div className="font-mono text-ink">{money(ov.quarter_totals.igst)}</div></div>
                </div>
                {(ov.unreceipted_count > 0 || ov.draft_count > 0) && (
                  <p className="mt-3 text-sm text-amber-800">
                    {ov.unreceipted_count > 0 && <>{ov.unreceipted_count} issued invoice(s) are not receipted, so not counted — GST may still be due on the supply. <button className="underline" onClick={() => setView("review")}>Review</button>. </>}
                    {ov.draft_count > 0 && <>{ov.draft_count} draft(s) ignored.</>}
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-display text-sm font-semibold text-ink">Your route this quarter</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {ov.months.filter((m) => m.iff_allowed).map((m) => (
                    <Card
                      key={m.period}
                      title={`IFF · ${m.label} (optional)`}
                      sub={`B2B only · tax paid by PMT-06 by ${portalDate(m.pmt06_due)}`}
                      due={m.iff_due}
                      filing={m.iff_filing}
                      amount={`${m.b2b_pending_for_iff.count} B2B · ${money(m.b2b_pending_for_iff.taxable_value)} taxable`}
                      onOpen={() => setView(`iff:${m.period}`)}
                    />
                  ))}
                  <div className="card p-4 text-sm text-ink-soft">
                    <div className="font-display text-sm font-semibold text-ink">{ov.months[2].label}</div>
                    Last month of the quarter: no IFF and no PMT-06. Everything is settled in the quarterly returns below.
                  </div>
                  <Card
                    title="GSTR-1 (quarterly)"
                    sub="Tables 4A, 5, 7, 12, 13"
                    due={ov.gstr1.due}
                    filing={ov.gstr1.filing}
                    amount={`${money(ov.quarter_totals.taxable_value)} taxable`}
                    onOpen={() => setView("gstr1")}
                  />
                  <Card
                    title="GSTR-3B (quarterly)"
                    sub="Output tax − ITC − PMT-06 = cash"
                    due={ov.gstr3b.due}
                    filing={ov.gstr3b.filing}
                    amount={`${money(ov.quarter_totals.cgst + ov.quarter_totals.sgst + ov.quarter_totals.igst)} output tax · ${money(ov.paid_so_far)} paid`}
                    onOpen={() => setView("gstr3b")}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-soft">{ov.due_note} QRMP is available only while aggregate turnover is within the limit; check eligibility on the portal. This is a filing aid, not a substitute for your CA's advice.</p>
            </div>
          )}

          {view === "review" && <ReviewPanel fy={fy} q={q} onChange={loadOverview} />}
          {view.startsWith("iff:") && <IffView fy={fy} q={q} period={view.slice(4)} refresh={loadOverview} />}
          {view === "gstr1" && <Gstr1View fy={fy} q={q} refresh={loadOverview} />}
          {view === "gstr3b" && <Gstr3bView fy={fy} q={q} refresh={loadOverview} />}
        </>
      )}
    </div>
  );
}
