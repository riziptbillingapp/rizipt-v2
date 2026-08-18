import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { fileToCompressedDataUrl } from "../utils/image.js";
import { buildUpiUri, generateQrDataUrl } from "../utils/upiQr.js";

const FIELDS = [
  ["name", "Company name"],
  ["legal_name", "Legal name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["gstin", "GSTIN"],
  ["pan", "PAN"],
  ["address_line1", "Address line 1"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "Pincode"],
  ["country", "Country"],
];

const BANK_FIELDS = [
  ["bank_name", "Bank name"],
  ["bank_account_no", "Bank account no."],
  ["bank_ifsc", "IFSC code"],
  ["upi_id", "UPI ID"],
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [qrPreview, setQrPreview] = useState(null);

  useEffect(() => {
    api.getCompany().then(setForm).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!form?.upi_id) return setQrPreview(null);
    const uri = buildUpiUri({ upiId: form.upi_id, payeeName: form.name });
    generateQrDataUrl(uri).then(setQrPreview);
  }, [form?.upi_id, form?.name]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const onLogoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the logo.");
      return;
    }
    setLogoUploading(true);
    setError("");
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 320, 0.85);
      update("logo_url", dataUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateCompany(form);
      // Merge rather than replace: if the server response is missing a field
      // (e.g. a column that hasn't been migrated on the live DB yet), this
      // keeps what's currently in the form instead of silently wiping it.
      setForm((f) => ({ ...f, ...updated }));
      setSavedAt(new Date());
    } catch (e) {
      const hint = /no such column/i.test(e.message)
        ? " — your database is missing a recent column. Run the migrations in backend/migrations against your live D1 database, then redeploy the Worker."
        : "";
      setError(e.message + hint);
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

      <form onSubmit={save} className="space-y-6">
        <div className="card p-6">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Logo</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-paper-line bg-paper">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Company logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-ink-soft">No logo</span>
              )}
            </div>
            <div>
              <label className="btn-secondary cursor-pointer">
                {logoUploading ? "Processing…" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" onChange={onLogoSelected} />
              </label>
              {form.logo_url && (
                <button
                  type="button"
                  className="ml-3 text-xs font-medium text-ledger-red hover:underline"
                  onClick={() => update("logo_url", "")}
                >
                  Remove
                </button>
              )}
              <p className="mt-2 text-xs text-ink-soft">PNG or JPG. Resized automatically for documents.</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
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

        <div className="card p-6">
          <h2 className="mb-1 font-display text-base font-semibold text-ink">Bank & payment details</h2>
          <p className="mb-3 text-xs text-ink-soft">
            Printed on documents, with a scannable UPI QR code generated automatically from your UPI ID.
          </p>
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 grid grid-cols-2 gap-4">
              {BANK_FIELDS.map(([field, label]) => (
                <div key={field}>
                  <label className="field-label">{label}</label>
                  <input
                    className="field-input"
                    placeholder={field === "upi_id" ? "yourname@bank" : ""}
                    value={form[field] ?? ""}
                    onChange={(e) => update(field, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-paper-line p-3">
              {qrPreview ? (
                <>
                  <img src={qrPreview} alt="UPI QR preview" className="h-28 w-28" />
                  <span className="mt-2 text-center text-[11px] text-ink-soft">Scan to pay via UPI</span>
                </>
              ) : (
                <span className="text-center text-xs text-ink-soft">Add a UPI ID to preview the payment QR</span>
              )}
            </div>
          </div>
        </div>

        <div className="card p-6">
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

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && <span className="text-xs text-ink-soft">Saved at {savedAt.toLocaleTimeString()}</span>}
        </div>
      </form>
    </div>
  );
}
