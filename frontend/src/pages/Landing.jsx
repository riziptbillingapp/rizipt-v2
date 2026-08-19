import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const FEATURES = [
  {
    title: "Quotation → Invoice → Receipt",
    body: "Approve a quotation, convert it straight into an invoice, then into a receipt — with the full lineage kept intact.",
  },
  {
    title: "UPI QR on every document",
    body: "Your customers scan and pay directly from the PDF. No separate payment link needed.",
  },
  {
    title: "Real PDF, not a screenshot",
    body: "Documents export as crisp, vector-text PDFs — GST-ready with HSN/SAC, discounts, and tax breakdowns.",
  },
  {
    title: "Install it like an app",
    body: "Add Rizipt to your home screen or desktop. Works like a native app, backed by Cloudflare's edge.",
  },
];

function HeroIllustration() {
  return (
    <svg viewBox="0 0 420 360" className="w-full max-w-md" role="img" aria-label="Stylized invoice document">
      <rect x="60" y="20" width="300" height="320" rx="10" fill="#FAF7EF" stroke="#233A5E" strokeWidth="2" />
      <rect x="60" y="20" width="300" height="56" rx="10" fill="#233A5E" />
      <rect x="82" y="40" width="120" height="16" rx="3" fill="#FAF7EF" />
      <circle cx="335" cy="48" r="14" fill="#FAF7EF" opacity="0.9" />
      <text x="335" y="53" fontSize="14" textAnchor="middle" fill="#233A5E" fontFamily="Georgia, serif">
        R
      </text>

      <rect x="82" y="96" width="140" height="10" rx="2" fill="#E7E0D0" />
      <rect x="82" y="114" width="180" height="8" rx="2" fill="#E7E0D0" />
      <rect x="82" y="128" width="160" height="8" rx="2" fill="#E7E0D0" />

      {[168, 194, 220, 246].map((y) => (
        <g key={y}>
          <rect x="82" y={y} width="256" height="18" rx="3" fill="#FFFFFF" stroke="#E7E0D0" />
          <rect x="90" y={y + 6} width="90" height="6" rx="2" fill="#565F6E" />
          <rect x="290" y={y + 6} width="40" height="6" rx="2" fill="#233A5E" />
        </g>
      ))}

      <rect x="230" y="280" width="108" height="34" rx="6" fill="#233A5E" />
      <text x="284" y="302" fontSize="13" textAnchor="middle" fill="#FAF7EF" fontFamily="Georgia, serif" fontWeight="bold">
        ₹ Net Payable
      </text>

      <g transform="translate(280,240) rotate(-12)">
        <rect x="-38" y="-14" width="76" height="28" rx="14" fill="none" stroke="#2F6F4E" strokeWidth="2.5" />
        <text x="0" y="5" fontSize="12" textAnchor="middle" fill="#2F6F4E" fontFamily="Georgia, serif" fontWeight="bold">
          APPROVED
        </text>
      </g>
    </svg>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-2xl font-semibold text-ink">Rizipt</span>
          <span className="font-mono text-xs text-ink-soft">v2</span>
        </div>
        <Link to="/login" className="btn-secondary">
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-12 md:grid-cols-2 md:py-20">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-ink md:text-5xl">
            Quotations, invoices, and receipts —<span className="text-ledger-navy"> done right.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-ink-soft">
            Approve a quotation, convert it into an invoice, then into a receipt — with UPI payments, GST-ready
            PDFs, and full document lineage, all in one place.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link to="/login" className="btn-primary px-6 py-3 text-base">
              Get started free
            </Link>
            <span className="text-xs text-ink-soft">14-day free trial · No card required</span>
          </div>
        </div>
        <div className="flex justify-center">
          <HeroIllustration />
        </div>
      </section>

      <section className="border-t border-paper-line bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-8 text-center font-display text-2xl font-semibold text-ink">
            Everything a small business needs to bill
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <h3 className="font-display text-base font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">Ready to send your first quotation?</h2>
        <div className="mt-6">
          <Link to="/login" className="btn-primary px-6 py-3 text-base">
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-paper-line px-6 py-8 text-center text-xs text-ink-soft">
        Rizipt — built on Cloudflare Workers + D1.
      </footer>
    </div>
  );
}
