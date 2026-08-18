import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "Billing History", end: true },
  { to: "/quotations", label: "Quotations" },
  { to: "/invoices", label: "Invoices" },
  { to: "/bills", label: "Bills / Receipts" },
  { to: "/customers", label: "Customers" },
  { to: "/products", label: "Products" },
  { to: "/company-profile", label: "Company Profile" },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-paper-line bg-white">
        <div className="border-b border-paper-line px-5 py-6">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-semibold text-ink">Rizipt</span>
            <span className="font-mono text-[11px] text-ink-soft">v2</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Quotation → Invoice → Receipt</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-paper hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-paper-line px-5 py-4 text-[11px] text-ink-soft">
          Cloudflare Workers + D1
        </div>
      </aside>
      <main className="flex-1 bg-paper">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
