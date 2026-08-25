import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { previewProjectStatusReportPdf, downloadProjectStatusReportPdf } from "../utils/generateProjectStatusReportPdf.js";

const STATUS_STYLES = {
  on_track: "bg-ledger-green/10 text-ledger-green",
  at_risk: "bg-ledger-amber/10 text-ledger-amber",
  delayed: "bg-ledger-red/10 text-ledger-red",
  completed: "bg-blue-100 text-blue-700",
};

const BAR_COLOR = {
  on_track: "bg-ledger-green",
  at_risk: "bg-ledger-amber",
  delayed: "bg-ledger-red",
  completed: "bg-blue-600",
};

function CompletionBar({ percent, colorClass = "bg-ink" }) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-line">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs text-ink-soft">{pct}%</span>
    </div>
  );
}

export default function ProjectStatusReportsListPage() {
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
      const res = await api.listProjectStatusReports();
      setItems(res || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    await api.deleteProjectStatusReport(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handlePreview(id) {
    const doc = await api.getProjectStatusReport(id);
    previewProjectStatusReportPdf({ doc, company });
  }

  async function handleDownload(id) {
    const doc = await api.getProjectStatusReport(id);
    downloadProjectStatusReportPdf({ doc, company });
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Project Status Reports</h1>
          <p className="text-sm text-ink-soft">Track milestones and overall project completion.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/project-status-reports/new")}>
          + New Status Report
        </button>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}
      {loading && <p className="text-ink-soft">Loading…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="card border-dashed p-10 text-center text-ink-soft">
          No status reports yet. Create your first project status report.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-paper text-ink-soft">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Doc #</th>
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Completion</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-line">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-paper">
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{r.doc_number}</td>
                  <td className="px-4 py-3 text-ink">{r.project_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{new Date(r.issue_date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.overall_status] || "bg-paper text-ink-soft"}`}>
                      {(r.overall_status || "").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CompletionBar percent={r.overall_completion} colorClass={BAR_COLOR[r.overall_status] || "bg-ink"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handlePreview(r.id)} className="btn-secondary text-xs">
                        Preview
                      </button>
                      <button onClick={() => handleDownload(r.id)} className="btn-secondary text-xs">
                        Download
                      </button>
                      <button onClick={() => navigate(`/project-status-reports/${r.id}/edit`)} className="btn-secondary text-xs">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs font-medium text-ledger-red hover:underline">
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
