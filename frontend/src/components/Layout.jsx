import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import InstallAppButton from "./InstallAppButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";

const NAV = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/billing-history", label: "Billing History" },
  { to: "/quotations", label: "Quotations" },
  { to: "/invoices", label: "Invoices" },
  { to: "/bills", label: "Bills / Receipts" },
  { to: "/customers", label: "Customers" },
  { to: "/products", label: "Products / Services" },
  { to: "/company-profile", label: "Company Profile" },
  { to: "/subscription", label: "Subscription" },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);

  useEffect(() => {
    api
      .getBillingStatus()
      .then((s) => {
        if (s.subscription_status === "trialing") setTrialDaysLeft(s.trial_days_left);
      })
      .catch(() => {});
  }, []);

  const nav = user?.isAdmin ? [...NAV, { to: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-paper-line bg-white">
        <div className="border-b border-paper-line px-5 py-6">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-semibold text-ink">Rizipt</span>
            <span className="font-mono text-[11px] text-ink-soft">v2</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Quotation → Invoice → Receipt</p>
          {trialDaysLeft !== null && (
            <p className="mt-2 text-[11px] font-medium text-ledger-amber">
              {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left in trial
            </p>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-paper-line px-3 py-3">
          <InstallAppButton />
        </div>
        {user && (
          <div className="flex items-center gap-2 border-t border-paper-line px-4 py-3">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink">
                {(user.name || user.email)[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink">{user.name || user.email}</div>
            </div>
            <button
              onClick={signOut}
              className="text-[11px] font-medium text-ink-soft hover:text-ledger-red"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 bg-paper">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

