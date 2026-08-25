// pages/ProjectStatusReportsListPage.jsx
// Route at e.g. /project-status-reports.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectStatusReportsApi } from '../api/newModules';
import {
  previewProjectStatusReportPdf,
  downloadProjectStatusReportPdf,
} from '../pdf/generateProjectStatusReportPdf';
import { useCompanyProfile } from '../hooks/useCompanyProfile';

const STATUS_STYLES = {
  on_track: 'bg-green-100 text-green-700',
  at_risk: 'bg-amber-100 text-amber-700',
  delayed: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};

function CompletionBar({ percent, colorClass = 'bg-gray-900' }) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-9 text-right">{pct}%</span>
    </div>
  );
}

const BAR_COLOR = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-500',
  delayed: 'bg-red-500',
  completed: 'bg-blue-500',
};

export default function ProjectStatusReportsListPage() {
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
      const res = await projectStatusReportsApi.list();
      setItems(res.items || []);
    } catch (e) {
      setError('Could not load project status reports.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this report? This cannot be undone.')) return;
    await projectStatusReportsApi.remove(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handlePreview(id) {
    const full = await projectStatusReportsApi.get(id);
    previewProjectStatusReportPdf(full, company);
  }

  async function handleDownload(id) {
    const full = await projectStatusReportsApi.get(id);
    downloadProjectStatusReportPdf(full, company);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Project Status Reports</h1>
          <p className="text-sm text-gray-500">Track milestones and overall project completion.</p>
        </div>
        <button
          onClick={() => navigate('/project-status-reports/new')}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
        >
          + New Status Report
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
          No status reports yet. Create your first project status report.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Doc #</th>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Completion</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.doc_number}</td>
                  <td className="px-4 py-3 text-gray-900">{r.project_name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(r.report_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[r.overall_status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {(r.overall_status || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CompletionBar
                      percent={r.overall_completion}
                      colorClass={BAR_COLOR[r.overall_status] || 'bg-gray-900'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handlePreview(r.id)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDownload(r.id)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => navigate(`/project-status-reports/${r.id}/edit`)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
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
