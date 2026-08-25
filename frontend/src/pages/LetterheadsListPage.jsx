import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { previewLetterheadPdf, downloadLetterheadPdf } from "../utils/generateLetterheadPdf.js";

export default function LetterheadsListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [company, setCompany] = useState(null);

  useEffect(() => {
    load();
    api.getCompany().then(setCompany).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.listLetterheads();
      setItems(res || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    await api.deleteLetterhead(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handlePreview(id) {
    const doc = await api.getLetterhead(id);
    previewLetterheadPdf({ doc, company });
  }

  async function handleDownload(id) {
    const doc = await api.getLetterhead(id);
    downloadLetterheadPdf({ doc, company });
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Letterheads</h1>
          <p className="text-sm text-ink-soft">
            Branded letters, notices, and Minutes of Meeting on company letterhead.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/letterheads/new")}>
          + New Letterhead Document
        </button>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}
      {loading && <p className="text-ink-soft">Loading…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="card border-dashed p-10 text-center text-ink-soft">
          No letterhead documents yet. Create your first Minutes of Meeting or notice.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-paper text-ink-soft">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Doc #</th>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-line">
              {items.map((doc) => (
                <tr key={doc.id} className="hover:bg-paper">
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{doc.doc_number}</td>
                  <td className="px-4 py-3 text-ink">{doc.title}</td>
                  <td className="px-4 py-3 capitalize text-ink-soft">{doc.doc_type}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(doc.issue_date).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        doc.status === "final" ? "bg-ledger-green/10 text-ledger-green" : "bg-paper text-ink-soft"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handlePreview(doc.id)} className="btn-secondary text-xs">
                        Preview
                      </button>
                      <button onClick={() => handleDownload(doc.id)} className="btn-secondary text-xs">
                        Download
                      </button>
                      <button onClick={() => navigate(`/letterheads/${doc.id}/edit`)} className="btn-secondary text-xs">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-xs font-medium text-ledger-red hover:underline"
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
