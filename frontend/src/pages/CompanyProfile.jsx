import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { fileToCompressedDataUrl, fileToCroppedStampDataUrl } from "../utils/image.js";
import { buildUpiUri, generateQrDataUrl } from "../utils/upiQr.js";
import { DEFAULT_BRAND_COLOR } from "../utils/color.js";

const COLOR_PRESETS = [
  { label: "Navy (default)", value: "#233A5E" },
  { label: "Blue", value: "#1D4ED8" },
  { label: "Teal", value: "#0F766E" },
  { label: "Green", value: "#2F6F4E" },
  { label: "Maroon", value: "#7F1D1D" },
  { label: "Purple", value: "#5B21B6" },
];

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
  ["letterhead_prefix", "Letterhead prefix"],
  ["psr_prefix", "Status report prefix"],
  ["default_tax_rate", "Default tax rate %"],
  ["currency", "Currency"],
];

// Same upload pattern as the Logo block, parameterized so Logo/Seal/Signature
// don't repeat three near-identical blocks of JSX below.
function ImageUploadCard({ title, hint, field, value, uploading, onSelect, onRemove }) {
  return (
    <div className="card p-6">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{title}</h2>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-paper-line bg-paper">
          {value ? (
            <img src={value} alt={title} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-ink-soft">None</span>
          )}
        </div>
        <div>
          <label className="btn-secondary cursor-pointer">
            {uploading ? "Processing…" : `Upload ${title.toLowerCase()}`}
            <input type="file" accept="image/*" className="hidden" onChange={onSelect} />
          </label>
          {value && (
            <button type="button" className="ml-3 text-xs font-medium text-ledger-red hover:underline" onClick={onRemove}>
              Remove
            </button>
          )}
          <p className="mt-2 text-xs text-ink-soft">{hint}</p>
        </div>
      </div>
    </div>
  );
}

export default function CompanyProfile() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [sealUploading, setSealUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
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

  function makeImageHandler(field, setUploading, { maxDim = 320 } = {}) {
    return async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError(`Please choose an image file for ${field.replace("_url", "")}.`);
        return;
      }
      setUploading(true);
      setError("");
      try {
        const dataUrl = await fileToCompressedDataUrl(file, maxDim, 0.9);
        update(field, dataUrl);
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(false);
      }
    };
  }

  // Seal/signature scans usually come with a lot of blank margin around the
  // actual ink (a photographed stamp on a full sheet of paper, for example).
  // fileToCroppedStampDataUrl trims that margin first, so the stamp/signature
  // itself — not the surrounding whitespace — fills the space it's given on
  // documents, instead of rendering tiny.
  function makeStampHandler(field, setUploading) {
    return async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError(`Please choose an image file for ${field.replace("_url", "")}.`);
        return;
      }
      setUploading(true);
      setError("");
      try {
        const dataUrl = await fileToCroppedStampDataUrl(file, { maxDim: 480, quality: 0.92, paddingRatio: 0.05 });
        update(field, dataUrl);
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(false);
      }
    };
  }

  const onLogoSelected = makeImageHandler("logo_url", setLogoUploading, { maxDim: 320 });
  const onSealSelected = makeStampHandler("seal_url", setSealUploading);
  const onSignatureSelected = makeStampHandler("signature_url", setSignatureUploading);

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
          Shown on every quotation, invoice, receipt, letterhead, and status report you issue.
        </p>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <form onSubmit={save} className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <ImageUploadCard
            title="Logo"
            hint="PNG or JPG. Resized automatically for documents."
            value={form.logo_url}
            uploading={logoUploading}
            onSelect={onLogoSelected}
            onRemove={() => update("logo_url", "")}
          />
          <ImageUploadCard
            title="Seal"
            hint="Company stamp/seal. Blank space around it is trimmed automatically so it prints true to size."
            value={form.seal_url}
            uploading={sealUploading}
            onSelect={onSealSelected}
            onRemove={() => update("seal_url", "")}
          />
          <ImageUploadCard
            title="Signature"
            hint="Scanned or photographed signature. Blank space around it is trimmed automatically."
            value={form.signature_url}
            uploading={signatureUploading}
            onSelect={onSignatureSelected}
            onRemove={() => update("signature_url", "")}
          />
        </div>

        <div className="card p-6">
          <h2 className="mb-1 font-display text-base font-semibold text-ink">Document theme color</h2>
          <p className="mb-3 text-xs text-ink-soft">
            Used for headings, the item table header, and totals on your quotations, invoices, receipts, letterheads,
            and status reports.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={form.brand_color || DEFAULT_BRAND_COLOR}
              onChange={(e) => update("brand_color", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-paper-line bg-white p-1"
            />
            <input
              className="field-input w-32 font-mono"
              value={form.brand_color || DEFAULT_BRAND_COLOR}
              onChange={(e) => update("brand_color", e.target.value)}
              placeholder="#233A5E"
            />
            <div className="flex gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.label}
                  onClick={() => update("brand_color", preset.value)}
                  className="h-7 w-7 rounded-full border border-paper-line ring-offset-2 hover:ring-2 hover:ring-ink/20"
                  style={{ backgroundColor: preset.value }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Business details</h2>
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className="field-label">{label}</label>
                <input className="field-input" value={form[field] ?? ""} onChange={(e) => update(field, e.target.value)} />
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
                <input className="field-input" value={form[field] ?? ""} onChange={(e) => update(field, e.target.value)} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Next numbers: {form.quotation_prefix}-{String(form.next_quotation_seq).padStart(4, "0")} · {form.invoice_prefix}-
            {String(form.next_invoice_seq).padStart(4, "0")} · {form.bill_prefix}-
            {String(form.next_bill_seq).padStart(4, "0")} · {form.letterhead_prefix}-
            {String(form.next_letterhead_seq).padStart(4, "0")} · {form.psr_prefix}-
            {String(form.next_psr_seq).padStart(4, "0")}
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
