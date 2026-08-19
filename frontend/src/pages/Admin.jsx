import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusStamp from "../components/StatusStamp.jsx";
import { money } from "../components/ItemsEditor.jsx";

export default function Admin() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => api.adminListClaims().then(setClaims).catch((e) => setError(e.message));

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user?.isAdmin]);

  if (!user?.isAdmin) {
    return (
      <div className="card p-6">
        <p className="text-sm text-ink-soft">You don't have access to this page.</p>
      </div>
    );
  }

  const act = async (id, fn) => {
    setBusyId(id);
    setError("");
    try {
      await fn(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = claims.filter((c) => c.status === "pending");
  const reviewed = claims.filter((c) => c.status !== "pending");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Admin — Payment claims</h1>
        <p className="text-sm text-ink-soft">Approve or reject subscription payments submitted by customers.</p>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <h2 className="mb-2 font-display text-lg font-semibold text-ink">Pending ({pending.length})</h2>
      <div className="card mb-8 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pending.map((c) => (
              <tr key={c.id} className="border-t border-paper-line">
                <td className="px-4 py-3 text-ink">{c.account_name}</td>
                <td className="px-4 py-3 capitalize text-ink-soft">{c.plan}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(c.amount)}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{c.utr_reference || "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{new Date(c.submitted_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-xs font-medium text-ledger-green hover:underline"
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, api.adminApproveClaim)}
                  >
                    Approve
                  </button>
                  <button
                    className="ml-3 text-xs font-medium text-ledger-red hover:underline"
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, api.adminRejectClaim)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  Nothing pending review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 font-display text-lg font-semibold text-ink">Reviewed</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Reviewed by</th>
            </tr>
          </thead>
          <tbody>
            {reviewed.map((c) => (
              <tr key={c.id} className="border-t border-paper-line">
                <td className="px-4 py-3 text-ink">{c.account_name}</td>
                <td className="px-4 py-3 capitalize text-ink-soft">{c.plan}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(c.amount)}</td>
                <td className="px-4 py-3">
                  <StatusStamp status={c.status} />
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">{c.reviewed_by || "—"}</td>
              </tr>
            ))}
            {reviewed.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  No claims reviewed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
