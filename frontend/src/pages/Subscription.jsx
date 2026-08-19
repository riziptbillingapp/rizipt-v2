import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { buildUpiUri, generateQrDataUrl } from "../utils/upiQr.js";
import { money } from "../components/ItemsEditor.jsx";

export default function Subscription() {
  const [status, setStatus] = useState(null);
  const [company, setCompany] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [utr, setUtr] = useState("");
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = () => {
    api.getBillingStatus().then(setStatus).catch((e) => setError(e.message));
    api.getCompany().then(setCompany).catch(() => {});
  };

  useEffect(load, []);

  useEffect(() => {
    if (!company?.upi_id || !status) return;
    const amount = status.plan_amounts?.[selectedPlan];
    const uri = buildUpiUri({ upiId: company.upi_id, payeeName: company.name, amount, note: `Rizipt ${selectedPlan}` });
    generateQrDataUrl(uri).then(setQr);
  }, [company?.upi_id, company?.name, selectedPlan, status]);

  const submitClaim = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.submitPaymentClaim({ plan: selectedPlan, utr_reference: utr });
      setSubmitted(true);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!status) return <p className="text-ink-soft">Loading…</p>;

  const amount = status.plan_amounts?.[selectedPlan];

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Subscription</h1>
        <p className="text-sm text-ink-soft">Manage your plan and payment.</p>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="card mb-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Current status</div>
            <div className="mt-1 font-display text-xl font-semibold text-ink capitalize">
              {status.plan === "grandfathered" ? "Active (grandfathered)" : status.subscription_status}
            </div>
          </div>
          {status.is_active ? (
            <span className="stamp stamp-approved">Active</span>
          ) : (
            <span className="stamp stamp-rejected">Expired</span>
          )}
        </div>
        {status.subscription_status === "trialing" && (
          <p className="mt-2 text-sm text-ink-soft">{status.trial_days_left} day(s) left in your free trial.</p>
        )}
        {status.current_period_end && status.period_days_left > 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            Current period ends {new Date(status.current_period_end).toLocaleDateString()} (
            {status.period_days_left} day(s) left).
          </p>
        )}
      </div>

      {status.pending_claim ? (
        <div className="card p-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Payment under review</h2>
          <p className="text-sm text-ink-soft">
            Your {status.pending_claim.plan} plan payment (₹{money(status.pending_claim.amount)}) with reference{" "}
            <span className="font-mono">{status.pending_claim.utr_reference || "—"}</span> is awaiting approval.
            This is usually quick — check back shortly.
          </p>
        </div>
      ) : submitted ? (
        <div className="card p-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-ledger-green">Payment submitted</h2>
          <p className="text-sm text-ink-soft">
            Thanks — we'll activate your subscription as soon as the payment is verified.
          </p>
        </div>
      ) : (
        <div className="card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Renew via UPI</h2>

          <div className="mb-4 flex gap-2">
            {["monthly", "yearly"].map((plan) => (
              <button
                key={plan}
                onClick={() => setSelectedPlan(plan)}
                className={`flex-1 rounded-md border px-4 py-3 text-left ${
                  selectedPlan === plan ? "border-ledger-navy bg-ledger-navy/5" : "border-paper-line bg-white"
                }`}
              >
                <div className="text-sm font-semibold capitalize text-ink">{plan}</div>
                <div className="font-mono text-lg text-ink">₹{money(status.plan_amounts?.[plan])}</div>
              </button>
            ))}
          </div>

          {company?.upi_id ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-paper-line p-4">
              {qr && <img src={qr} alt="UPI QR" className="h-40 w-40" />}
              <div className="text-center text-sm">
                <div className="font-mono text-ink">{company.upi_id}</div>
                <div className="text-ink-soft">Pay ₹{money(amount)} via any UPI app, then enter the reference below</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ledger-amber">
              No UPI ID configured yet. Add one in Company Profile before renewing.
            </p>
          )}

          <form onSubmit={submitClaim} className="mt-4 space-y-3">
            <div>
              <label className="field-label">UPI reference / UTR number</label>
              <input
                required
                className="field-input"
                placeholder="e.g. 402812345678"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Submitting…" : "I've paid — submit for review"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
