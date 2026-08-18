import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";

const emptyForm = { name: "", email: "", phone: "", gstin: "", billing_address: "", shipping_address: "", notes: "" };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => api.listCustomers(search).then(setCustomers).catch((e) => setError(e.message));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setEditingId(customer.id);
    setForm(customer);
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.updateCustomer(editingId, form);
      } else {
        await api.createCustomer(form);
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const archive = async (id) => {
    if (!confirm("Archive this customer?")) return;
    await api.archiveCustomer(id);
    load();
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Customers</h1>
          <p className="text-sm text-ink-soft">Everyone you quote, invoice, and bill.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          + New customer
        </button>
      </header>

      <input
        className="field-input mb-4 max-w-sm"
        placeholder="Search customers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">GSTIN</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-paper-line hover:bg-paper/60">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {c.email}
                  {c.email && c.phone ? " · " : ""}
                  {c.phone}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{c.gstin || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-medium text-ledger-navy hover:underline" onClick={() => openEdit(c)}>
                    Edit
                  </button>
                  <button
                    className="ml-3 text-xs font-medium text-ledger-red hover:underline"
                    onClick={() => archive(c.id)}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit customer" : "New customer"}>
        {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="field-label">Name *</label>
            <input
              required
              className="field-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Email</label>
              <input
                className="field-input"
                value={form.email || ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input
                className="field-input"
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="field-label">GSTIN</label>
            <input
              className="field-input"
              value={form.gstin || ""}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Billing address</label>
            <textarea
              className="field-input"
              rows={2}
              value={form.billing_address || ""}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Shipping address</label>
            <textarea
              className="field-input"
              rows={2}
              value={form.shipping_address || ""}
              onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editingId ? "Save changes" : "Create customer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
