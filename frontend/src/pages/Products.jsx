import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { money } from "../components/ItemsEditor.jsx";

const emptyForm = { name: "", sku: "", hsn_sac: "", description: "", unit: "unit", price: 0, tax_rate: 0 };

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => api.listProducts(search).then(setProducts).catch((e) => setError(e.message));

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

  const openEdit = (product) => {
    setEditingId(product.id);
    setForm(product);
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.updateProduct(editingId, form);
      } else {
        await api.createProduct(form);
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const archive = async (id) => {
    if (!confirm("Archive this product?")) return;
    await api.archiveProduct(id);
    load();
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Products</h1>
          <p className="text-sm text-ink-soft">Catalog items you can drop straight into a document.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          + New product
        </button>
      </header>

      <input
        className="field-input mb-4 max-w-sm"
        placeholder="Search products…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">SKU</th>
              <th className="px-4 py-3 font-semibold">HSN/SAC</th>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="px-4 py-3 text-right font-semibold">Tax %</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-paper-line hover:bg-paper/60">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{p.sku || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{p.hsn_sac || "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{p.unit}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(p.price)}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.tax_rate}%</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-medium text-ledger-navy hover:underline" onClick={() => openEdit(p)}>
                    Edit
                  </button>
                  <button
                    className="ml-3 text-xs font-medium text-ledger-red hover:underline"
                    onClick={() => archive(p.id)}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit product" : "New product"}>
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
              <label className="field-label">SKU</label>
              <input
                className="field-input"
                value={form.sku || ""}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Unit</label>
              <input
                className="field-input"
                value={form.unit || "unit"}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="field-label">HSN/SAC code</label>
            <input
              className="field-input"
              placeholder="e.g. 998361"
              value={form.hsn_sac || ""}
              onChange={(e) => setForm({ ...form, hsn_sac: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Price</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Tax rate %</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="field-input"
              rows={2}
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editingId ? "Save changes" : "Create product"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
