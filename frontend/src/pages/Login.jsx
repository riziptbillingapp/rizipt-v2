import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";

const ERROR_MESSAGES = {
  invalid_state: "That sign-in link expired or was tampered with. Please try again.",
  auth_failed: "Google sign-in failed. Please try again.",
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("error");
    if (code) setError(ERROR_MESSAGES[code] || "Sign-in failed. Please try again.");
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mb-6 flex items-baseline justify-center gap-1">
          <span className="font-display text-3xl font-semibold text-ink">Rizipt</span>
          <span className="font-mono text-xs text-ink-soft">v2</span>
        </div>
        <p className="mb-6 text-sm text-ink-soft">
          Quotations, invoices, and receipts for your business.
        </p>

        {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}

        <a
          href={api.googleLoginUrl()}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-paper-line bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm hover:border-ink/40"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
            />
          </svg>
          Continue with Google
        </a>

        <p className="mt-6 text-xs text-ink-soft">
          14-day free trial. No card required.
        </p>
      </div>
    </div>
  );
}
