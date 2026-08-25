import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";

const emptyItem = () => ({ task_name: "", owner: "", status: "in_progress", completion: 0, due_date: "", notes: "" });

const emptyForm = {
  project_name: "",
  issue_date: new Date().toISOString().slice(0, 10),
  period_from: "",
  period_to: "",
  overall_status: "on_track",
  summary: "",
  prepared_by: "",
  status: "draft",
  items: [emptyItem()],
};

function LiveCompletionBar({ percent }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper-line">
        <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-medium text-ink">{pct}%</span>
    </div>
  );
}

export default function ProjectStatusReportFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEdit) {
      api
        .getProjectStatusReport(id)
        .then((r) => setForm({ ...r, items: r.items?.length ? r.items : [emptyItem()] }))
        .catch((e) => setError(e.message));
    }
  }, [id]);

  const overallCompletion = useMemo(() => {
    if (!form.items.length) return 0;
    return form.items.reduce((sum, it) => sum + (Number(it.completion) || 0), 0) / form.items.length;
  }, [form.items]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

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
    setError("");
    try {
      const payload = { ...form, items: form.items.filter((it) => it.task_name.trim()) };
      if (isEdit) {
        await api.updateProjectStatusReport(id, payload);
      } else {
        await api.createProjectStatusReport(payload);
      }
      navigate("/project-status-reports");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {isEdit ? "Edit Status Report" : "New Project Status Report"}
        </h1>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card grid grid-cols-2 gap-4 p-6">
          <div className="col-span-2">
            <label className="field-label">Project Name</label>
            <input className="field-input" value={form.project_name} onChange={(e) => update("project_name", e.target.value)} required />
          </div>

          <div>
            <label className="field-label">Report Date</label>
            <input type="date" className="field-input" value={form.issue_date} onChange={(e) => update("issue_date", e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Overall Status</label>
            <select className="field-input" value={form.overall_status} onChange={(e) => update("overall_status", e.target.value)}>
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="field-label">Period From</label>
            <input type="date" className="field-input" value={form.period_from || ""} onChange={(e) => update("period_from", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Period To</label>
            <input type="date" className="field-input" value={form.period_to || ""} onChange={(e) => update("period_to", e.target.value)} />
          </div>

          <div className="col-span-2">
            <label className="field-label">Prepared By</label>
            <input className="field-input" value={form.prepared_by || ""} onChange={(e) => update("prepared_by", e.target.value)} />
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-2 text-sm font-medium text-ink">Overall Completion (auto)</div>
          <LiveCompletionBar percent={overallCompletion} />
        </div>

        <div className="card p-6">
          <label className="field-label">Summary (optional)</label>
          <textarea className="field-input" rows={3} value={form.summary || ""} onChange={(e) => update("summary", e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="field-label mb-0">Milestones / Tasks</label>
            <button type="button" onClick={addItem} className="btn-secondary text-xs">
              + Add Task
            </button>
          </div>

          <div className="space-y-3">
            {form.items.map((it, index) => (
              <div key={index} className="card space-y-2 p-3">
                <div className="grid grid-cols-12 gap-2">
                  <input
                    className="field-input col-span-5"
                    placeholder="Task name"
                    value={it.task_name}
                    onChange={(e) => setItem(index, "task_name", e.target.value)}
                  />
                  <input
                    className="field-input col-span-3"
                    placeholder="Owner"
                    value={it.owner}
                    onChange={(e) => setItem(index, "owner", e.target.value)}
                  />
                  <select className="field-input col-span-2" value={it.status} onChange={(e) => setItem(index, "status", e.target.value)}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                  <input
                    type="date"
                    className="field-input col-span-2"
                    value={it.due_date || ""}
                    onChange={(e) => setItem(index, "due_date", e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={it.completion}
                    onChange={(e) => setItem(index, "completion", Number(e.target.value))}
                    className="flex-1"
                  />
                  <LiveCompletionBar percent={it.completion} />
                  <button type="button" onClick={() => removeItem(index)} className="shrink-0 text-xs text-ledger-red hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={() => navigate("/project-status-reports")}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Report"}
          </button>
        </div>
      </form>
    </div>
  );
}
