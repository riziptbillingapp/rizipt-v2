import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";

const DOC_TYPES = [
  { value: "general", label: "General Letter" },
  { value: "mom", label: "Minutes of Meeting" },
  { value: "notice", label: "Notice" },
  { value: "other", label: "Other" },
];

const empty = {
  doc_type: "general",
  title: "",
  subject: "",
  issue_date: new Date().toISOString().slice(0, 10),
  recipient_name: "",
  recipient_address: "",
  body_content: "",
  prepared_by: "",
  status: "draft",
};

export default function LetterheadFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEdit) {
      api.getLetterhead(id).then(setForm).catch((e) => setError(e.message));
    }
  }, [id]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await api.updateLetterhead(id, form);
      } else {
        await api.createLetterhead(form);
      }
      navigate("/letterheads");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {isEdit ? "Edit Document" : "New Letterhead Document"}
        </h1>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Document Type</label>
              <select className="field-input" value={form.doc_type} onChange={(e) => update("doc_type", e.target.value)}>
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                className="field-input"
                value={form.issue_date}
                onChange={(e) => update("issue_date", e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="field-label">Title</label>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Minutes of Meeting - August Project Review"
              required
            />
          </div>

          <div>
            <label className="field-label">Subject (optional)</label>
            <input className="field-input" value={form.subject} onChange={(e) => update("subject", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Recipient (optional)</label>
              <input
                className="field-input"
                value={form.recipient_name}
                onChange={(e) => update("recipient_name", e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Prepared By</label>
              <input
                className="field-input"
                value={form.prepared_by}
                onChange={(e) => update("prepared_by", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Recipient Address (optional)</label>
            <textarea
              className="field-input"
              rows={2}
              value={form.recipient_address}
              onChange={(e) => update("recipient_address", e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Content</label>
            <textarea
              className="field-input font-mono"
              rows={12}
              value={form.body_content}
              onChange={(e) => update("body_content", e.target.value)}
              placeholder="Write the letter or meeting minutes here…"
              required
            />
          </div>

          <div>
            <label className="field-label">Status</label>
            <select className="field-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="draft">Draft</option>
              <option value="final">Final</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate("/letterheads")}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Document"}
          </button>
        </div>
      </form>
    </div>
  );
}
