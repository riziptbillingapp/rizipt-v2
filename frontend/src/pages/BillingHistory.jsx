import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import StatusStamp from "../components/StatusStamp.jsx";
import { money } from "../components/ItemsEditor.jsx";

const TYPE_LABEL = { quotation: "Quotation", invoice: "Invoice", bill: "Bill / Receipt" };

function ChainModal({ entry, onClose }) {
  const [chain, setChain] = useState(null);

  useEffect(() => {
    if (entry) {
      api.getChain(entry.doc_type, entry.id).then(setChain);
    }
  }, [entry]);

  if (!entry) return null;

  const Step = ({ label, doc, kind }) => (
    <div className={`card flex-1 p-4 ${doc ? "" : "opacity-40"}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      {doc ? (
        <>
          <div className="doc-number text-sm font-semibold">{doc.doc_number}</div>
          <div className="mt-1 font-mono text-sm text-ink">{money(doc.grand_total)}</div>
          <div className="mt-2 flex gap-1.5">
            <StatusStamp status={doc.status} />
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-soft">Not created yet</div>
      )}
    </div>
  );

  return (
    <Modal open={!!entry} onClose={onClose} title="Document lineage" wide>
      {!chain ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <div className="flex items-stretch gap-3">
          <Step label="Quotation" doc={chain.quotation} />
          <div className="flex items-center text-ink-soft">→</div>
          <Step label="Invoice" doc={chain.invoice} />
          <div className="flex items-center text-ink-soft">→</div>
          <Step label="Bill / Receipt" doc={chain.bill} />
        </div>
      )}
    </Modal>
  );
}

export default function BillingHistory() {
  const [entries, setEntries] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listHistory()
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = entries.filter((e) => typeFilter === "all" || e.doc_type === typeFilter);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Billing History</h1>
        <p className="text-sm text-ink-soft">
          Every quotation, invoice, and receipt in one ledger. Click a row to trace its full document chain.
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        {["all", "quotation", "invoice", "bill"].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              typeFilter === t
                ? "border-ink bg-ink text-paper"
                : "border-paper-line bg-white text-ink-soft hover:border-ink/40"
            }`}
          >
            {t === "all" ? "All documents" : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="card overflow-hidden bg-ledger">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Number</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Approval</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr
                key={`${e.doc_type}-${e.id}`}
                className="cursor-pointer border-t border-paper-line hover:bg-white"
                onClick={() => setSelected(e)}
              >
                <td className="px-4 py-3 text-xs font-medium text-ink-soft">{TYPE_LABEL[e.doc_type]}</td>
                <td className="doc-number px-4 py-3">{e.doc_number}</td>
                <td className="px-4 py-3 text-ink">{e.customer_name || "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{e.issue_date}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(e.grand_total)}</td>
                <td className="px-4 py-3">
                  <StatusStamp status={e.status} />
                </td>
                <td className="px-4 py-3">{e.approval_status && <StatusStamp status={e.approval_status} />}</td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  Nothing here yet — create a quotation to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ChainModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
