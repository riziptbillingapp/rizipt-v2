import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { money } from "../components/ItemsEditor.jsx";

const currentPeriod = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SectionTable({ title, rows, columns, emptyText }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-paper-line px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-3 py-2 font-semibold ${col.right ? "text-right" : ""}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-paper-line">
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2 ${col.right ? "text-right font-mono" : ""}`}>
                    {col.format ? col.format(row[col.key], row) : row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-soft">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GstFiling() {
  const [period, setPeriod] = useState(currentPeriod());
  const [gstr1, setGstr1] = useState(null);
  const [gstr3b, setGstr3b] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [r1, r3b] = await Promise.all([api.getGstr1(period), api.getGstr3b(period)]);
      setGstr1(r1);
      setGstr3b(r3b);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">GST Filing</h1>
        <p className="text-sm text-ink-soft">
          GSTR-1 and GSTR-3B figures generated from your invoices and direct bills for the selected month. Review
          against your GST portal draft before filing — this is a filing aid, not a substitute for your CA's sign-off.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Period</label>
          <input
            type="month"
            className="field-input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        {gstr1 && (
          <>
            <button className="btn-secondary" onClick={() => downloadJson(gstr1, `GSTR1-${period}.json`)}>
              Download GSTR-1 JSON
            </button>
            <button className="btn-secondary" onClick={() => api.downloadGstr1Csv(period).catch((e) => setError(e.message))}>
              Download GSTR-1 CSV
            </button>
          </>
        )}
        {gstr3b && (
          <>
            <button className="btn-secondary" onClick={() => downloadJson(gstr3b, `GSTR3B-${period}.json`)}>
              Download GSTR-3B JSON
            </button>
            <button className="btn-secondary" onClick={() => api.downloadGstr3bCsv(period).catch((e) => setError(e.message))}>
              Download GSTR-3B CSV
            </button>
          </>
        )}
      </div>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}
      {loading && <p className="text-sm text-ink-soft">Loading…</p>}

      {!loading && gstr1 && gstr3b && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">GSTR-3B — Table 3.1(a)</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div>
                <div className="field-label">Documents</div>
                <div className="font-mono text-ink">{gstr3b.document_count}</div>
              </div>
              <div>
                <div className="field-label">Taxable value</div>
                <div className="font-mono text-ink">{money(gstr3b.outward_taxable_supplies.taxable_value)}</div>
              </div>
              <div>
                <div className="field-label">IGST</div>
                <div className="font-mono text-ink">{money(gstr3b.outward_taxable_supplies.igst)}</div>
              </div>
              <div>
                <div className="field-label">CGST</div>
                <div className="font-mono text-ink">{money(gstr3b.outward_taxable_supplies.cgst)}</div>
              </div>
              <div>
                <div className="field-label">SGST</div>
                <div className="font-mono text-ink">{money(gstr3b.outward_taxable_supplies.sgst)}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-soft">{gstr3b.note}</p>
          </div>

          <SectionTable
            title={`B2B invoices (${gstr1.b2b.length})`}
            rows={gstr1.b2b}
            emptyText="No B2B supplies (customers with a GSTIN) this period."
            columns={[
              { key: "doc_number", label: "Doc #" },
              { key: "issue_date", label: "Date" },
              { key: "customer_name", label: "Customer" },
              { key: "customer_gstin", label: "GSTIN" },
              { key: "place_of_supply_name", label: "Place of supply" },
              { key: "rate", label: "Rate", right: true, format: (v) => `${v}%` },
              { key: "taxable_value", label: "Taxable value", right: true, format: money },
              { key: "igst", label: "IGST", right: true, format: money },
              { key: "cgst", label: "CGST", right: true, format: money },
              { key: "sgst", label: "SGST", right: true, format: money },
            ]}
          />

          <SectionTable
            title={`B2C Large (${gstr1.b2cl.length})`}
            rows={gstr1.b2cl}
            emptyText="No inter-state B2C invoices above the large-invoice threshold this period."
            columns={[
              { key: "doc_number", label: "Doc #" },
              { key: "issue_date", label: "Date" },
              { key: "place_of_supply_name", label: "Place of supply" },
              { key: "rate", label: "Rate", right: true, format: (v) => `${v}%` },
              { key: "taxable_value", label: "Taxable value", right: true, format: money },
              { key: "igst", label: "IGST", right: true, format: money },
            ]}
          />

          <SectionTable
            title={`B2C Small — aggregated (${gstr1.b2cs.length})`}
            rows={gstr1.b2cs}
            emptyText="No B2C small supplies this period."
            columns={[
              { key: "place_of_supply_name", label: "Place of supply" },
              { key: "rate", label: "Rate", right: true, format: (v) => `${v}%` },
              { key: "taxable_value", label: "Taxable value", right: true, format: money },
              { key: "igst", label: "IGST", right: true, format: money },
              { key: "cgst", label: "CGST", right: true, format: money },
              { key: "sgst", label: "SGST", right: true, format: money },
            ]}
          />

          <SectionTable
            title={`HSN/SAC summary (${gstr1.hsn.length})`}
            rows={gstr1.hsn}
            emptyText="No line items with an HSN/SAC code this period."
            columns={[
              { key: "hsn_sac", label: "HSN/SAC" },
              { key: "rate", label: "Rate", right: true, format: (v) => `${v}%` },
              { key: "unit", label: "Unit" },
              { key: "quantity", label: "Qty", right: true },
              { key: "taxable_value", label: "Taxable value", right: true, format: money },
              { key: "igst", label: "IGST", right: true, format: money },
              { key: "cgst", label: "CGST", right: true, format: money },
              { key: "sgst", label: "SGST", right: true, format: money },
            ]}
          />

          <p className="text-xs text-ink-soft">{gstr1.note}</p>
        </div>
      )}
    </div>
  );
}
