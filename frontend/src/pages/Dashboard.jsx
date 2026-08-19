import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../components/ItemsEditor.jsx";

function StatCard({ label, value, sub, to }) {
  const content = (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block transition-opacity hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBillingStatus().then(setStatus).catch(() => {});
    Promise.all([api.listQuotations(), api.listInvoices(), api.listBills()])
      .then(([q, i, b]) => {
        setQuotations(q);
        setInvoices(i);
        setBills(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  const pendingApproval =
    quotations.filter((q) => q.approval_status === "pending").length +
    invoices.filter((i) => i.approval_status === "pending").length;

  const outstandingInvoices = invoices.filter((i) => i.status !== "converted" && i.status !== "void");
  const outstandingTotal = outstandingInvoices.reduce((s, i) => s + (i.grand_total - (i.amount_paid || 0)), 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const revenueThisMonth = bills
    .filter((b) => b.status !== "void" && b.issue_date?.startsWith(thisMonth))
    .reduce((s, b) => s + b.grand_total, 0);

  const firstName = user?.name?.split(" ")[0];

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        </h1>
        <p className="text-sm text-ink-soft">Here's where things stand.</p>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      {status && !status.is_active && (
        <div className="mb-6 rounded-md border border-ledger-red/30 bg-ledger-red/5 px-4 py-3 text-sm text-ledger-red">
          Your trial has ended.{" "}
          <Link to="/subscription" className="font-semibold underline">
            Renew your subscription
          </Link>{" "}
          to keep creating documents. Your existing data is safe and still viewable.
        </div>
      )}
      {status && status.is_active && status.subscription_status === "trialing" && status.trial_days_left <= 5 && (
        <div className="mb-6 rounded-md border border-ledger-amber/30 bg-ledger-amber/10 px-4 py-3 text-sm text-ledger-amber">
          {status.trial_days_left} day{status.trial_days_left === 1 ? "" : "s"} left in your free trial.{" "}
          <Link to="/subscription" className="font-semibold underline">
            Subscribe now
          </Link>{" "}
          to avoid any interruption.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending approval" value={pendingApproval} sub="Quotations + invoices" to="/quotations" />
        <StatCard
          label="Outstanding"
          value={`₹${money(outstandingTotal)}`}
          sub={`${outstandingInvoices.length} unpaid invoice${outstandingInvoices.length === 1 ? "" : "s"}`}
          to="/invoices"
        />
        <StatCard label="Revenue this month" value={`₹${money(revenueThisMonth)}`} sub="From receipts" to="/bills" />
        <StatCard
          label="Total customers"
          value={new Set([...quotations, ...invoices, ...bills].map((d) => d.customer_id)).size || 0}
          to="/customers"
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/quotations" className="btn-primary">
            + New quotation
          </Link>
          <Link to="/invoices" className="btn-secondary">
            + New invoice
          </Link>
          <Link to="/bills" className="btn-secondary">
            + New bill / receipt
          </Link>
          <Link to="/billing-history" className="btn-secondary">
            View billing history
          </Link>
        </div>
      </div>
    </div>
  );
}
