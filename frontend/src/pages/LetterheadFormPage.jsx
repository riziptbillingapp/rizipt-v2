// pages/LetterheadFormPage.jsx
// Route at /letterheads/new and /letterheads/:id/edit

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { letterheadsApi } from '../api/newModules';

const DOC_TYPES = [
  { value: 'general', label: 'General Letter' },
  { value: 'mom', label: 'Minutes of Meeting' },
  { value: 'notice', label: 'Notice' },
  { value: 'other', label: 'Other' },
];

const empty = {
  doc_type: 'general',
  title: '',
  subject: '',
  doc_date: new Date().toISOString().slice(0, 10),
  recipient_name: '',
  recipient_address: '',
  body_content: '',
  prepared_by: '',
  status: 'draft',
};

export default function LetterheadFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      letterheadsApi.get(id).then((doc) => setForm(doc));
    }
  }, [id]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await letterheadsApi.update(id, form);
      } else {
        await letterheadsApi.create(form);
      }
      navigate('/letterheads');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">
        {isEdit ? 'Edit Document' : 'New Letterhead Document'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Document Type</label>
            <select
              value={form.doc_type}
              onChange={(e) => set('doc_type', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={form.doc_date}
              onChange={(e) => set('doc_date', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Minutes of Meeting - August Project Review"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Subject (optional)</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Recipient (optional)</label>
            <input
              type="text"
              value={form.recipient_name}
              onChange={(e) => set('recipient_name', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Prepared By</label>
            <input
              type="text"
              value={form.prepared_by}
              onChange={(e) => set('prepared_by', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Recipient Address (optional)</label>
          <textarea
            value={form.recipient_address}
            onChange={(e) => set('recipient_address', e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Content</label>
          {/* Swap this <textarea> for your existing rich-text editor component
              if you have one (e.g. for Company Profile notes) so MoM content
              can have bullet points / bold text. Plain textarea works fine
              for now — the PDF generator strips markup either way. */}
          <textarea
            value={form.body_content}
            onChange={(e) => set('body_content', e.target.value)}
            rows={12}
            placeholder="Write the letter or meeting minutes here..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/letterheads')}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Document'}
          </button>
        </div>
      </form>
    </div>
  );
}

