// pages/LetterheadsListPage.jsx
// Route this at e.g. /letterheads in your router, matching how
// /quotations, /invoices etc. are already routed.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // adjust if you use a different router
import { letterheadsApi } from '../api/newModules';
import { previewLetterheadPdf, downloadLetterheadPdf } from '../pdf/generateLetterheadPdf';
import { useCompanyProfile } from '../hooks/useCompanyProfile'; // <-- reuse your existing hook

export default function LetterheadsListPage() {
  const navigate = useNavigate();
  const { company } = useCompanyProfile();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await letterheadsApi.list();
      setItems(res.items || []);
    } catch (e) {
      setError('Could not load letterhead documents.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    await letterheadsApi.remove(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handlePreview(id) {
    const full = await letterheadsApi.get(id);
    previewLetterheadPdf(full, company);
  }

  async function handleDownload(id) {
    const full = await letterheadsApi.get(id);
    downloadLetterheadPdf(full, company);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Letterheads</h1>
          <p className="text-sm text-gray-500">
            Branded letters, notices, and Minutes of Meeting on company letterhead.
          </p>
        </div>
        <button
          onClick={() => navigate('/letterheads/new')}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
        >
          + New Letterhead Document
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
          No letterhead documents yet. Create your first Minutes of Meeting or notice.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Doc #</th>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{doc.doc_number}</td>
                  <td className="px-4 py-3 text-gray-900">{doc.title}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">{doc.doc_type}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(doc.doc_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'final'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handlePreview(doc.id)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => navigate(`/letterheads/${doc.id}/edit`)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

