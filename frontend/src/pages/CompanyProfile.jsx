import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const FIELDS = [
  ["name", "Company name"],
  ["legal_name", "Legal name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["gstin", "GSTIN"],
  ["pan", "PAN"],
  ["address_line1", "Address line 1"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "Pincode"],
  ["country", "Country"],
  ["bank_name", "Bank name"],
  ["bank_account_no", "Bank account no."],
  ["bank_ifsc", "IFSC code"],
];

const NUMBERING_FIELDS = [
  ["quotation_prefix", "Quotation prefix"],
  ["invoice_prefix", "Invoice prefix"],
  ["bill_prefix", "Bill/receipt prefix"],
  ["default_tax_rate", "Default tax rate %"],
  ["currency", "Currency"],
];

export default function CompanyProfile() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCompany().then(setForm).catch((e) => setError(e.message));
  }, []);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateCompany(form);
      setForm(updated);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <p className="text-ink-soft">Loading…</p>;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Company Profile</h1>
        <p className="text-sm text-ink-soft">
          Shown on every quotation, invoice, and receipt you issue.
        </p>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <form onSubmit={save} className="card space-y-6 p-6">
        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Business details</h2>
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className="field-label">{label}</label>
                <input
                  className="field-input"
                  value={form[field] ?? ""}
                  onChange={(e) => update(field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-paper-line pt-6">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Document numbering</h2>
          <div className="grid grid-cols-3 gap-4">
            {NUMBERING_FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className="field-label">{label}</label>
                <input
                  className="field-input"
                  value={form[field] ?? ""}
                  onChange={(e) => update(field, e.target.value)}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Next numbers: {form.quotation_prefix}-{String(form.next_quotation_seq).padStart(4, "0")} · {form.invoice_prefix}-
            {String(form.next_invoice_seq).padStart(4, "0")} · {form.bill_prefix}-
            {String(form.next_bill_seq).padStart(4, "0")}
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-paper-line pt-4">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && <span className="text-xs text-ink-soft">Saved at {savedAt.toLocaleTimeString()}</span>}
        </div>
      </form>
    </div>
  );
}
