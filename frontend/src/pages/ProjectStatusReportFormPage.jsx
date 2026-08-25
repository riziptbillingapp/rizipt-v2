// pages/ProjectStatusReportFormPage.jsx
// Route at /project-status-reports/new and /project-status-reports/:id/edit

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectStatusReportsApi } from '../api/newModules';

const emptyItem = () => ({
  task_name: '',
  owner: '',
  status: 'in_progress',
  completion: 0,
  due_date: '',
  notes: '',
});

const emptyForm = {
  project_name: '',
  report_date: new Date().toISOString().slice(0, 10),
  period_from: '',
  period_to: '',
  overall_status: 'on_track',
  summary: '',
  prepared_by: '',
  status: 'draft',
  items: [emptyItem()],
};

function LiveCompletionBar({ percent }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-gray-900 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function ProjectStatusReportFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      projectStatusReportsApi.get(id).then((r) =>
        setForm({ ...r, items: r.items?.length ? r.items : [emptyItem()] })
      );
    }
  }, [id]);

  const overallCompletion = useMemo(() => {
    if (!form.items.length) return 0;
    return form.items.reduce((sum, it) => sum + (Number(it.completion) || 0), 0) / form.items.length;
  }, [form.items]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setItem(index, field, value) {
    setForm((f) => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      return { ...f, items };
    });
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  }

  function removeItem(index) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, items: form.items.filter((it) => it.task_name.trim()) };
      if (isEdit) {
        await projectStatusReportsApi.update(id, payload);
      } else {
        await projectStatusReportsApi.create(payload);
      }
      navigate('/project-status-reports');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">
        {isEdit ? 'Edit Status Report' : 'New Project Status Report'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-700">Project Name</label>
            <input
              type="text"
              value={form.project_name}
              onChange={(e) => set('project_name', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Report Date</label>
            <input
              type="date"
              value={form.report_date}
              onChange={(e) => set('report_date', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Overall Status</label>
            <select
              value={form.overall_status}
              onChange={(e) => set('overall_status', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Period From</label>
            <input
              type="date"
              value={form.period_from || ''}
              onChange={(e) => set('period_from', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Period To</label>
            <input
              type="date"
              value={form.period_to || ''}
              onChange={(e) => set('period_to', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Live overall completion preview — recomputed as the average of
            task completions below, same value the backend recomputes on save. */}
        <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
          <div className="text-sm font-medium text-gray-700 mb-2">Overall Completion (auto)</div>
          <LiveCompletionBar percent={overallCompletion} />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Summary (optional)</label>
          <textarea
            value={form.summary || ''}
            onChange={(e) => set('summary', e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* --- Milestones / tasks --- */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Milestones / Tasks</label>
            <button
              type="button"
              onClick={addItem}
              className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
            >
              + Add Task
            </button>
          </div>

          <div className="space-y-3">
            {form.items.map((it, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Task name"
                    value={it.task_name}
                    onChange={(e) => setItem(index, 'task_name', e.target.value)}
                    className="col-span-5 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Owner"
                    value={it.owner}
                    onChange={(e) => setItem(index, 'owner', e.target.value)}
                    className="col-span-3 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={it.status}
                    onChange={(e) => setItem(index, 'status', e.target.value)}
                    className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                  <input
                    type="date"
                    value={it.due_date || ''}
                    onChange={(e) => setItem(index, 'due_date', e.target.value)}
                    className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={it.completion}
                    onChange={(e) => setItem(index, 'completion', Number(e.target.value))}
                    className="flex-1"
                  />
                  <LiveCompletionBar percent={it.completion} />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/project-status-reports')}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Report'}
          </button>
        </div>
      </form>
    </div>
  );
}

