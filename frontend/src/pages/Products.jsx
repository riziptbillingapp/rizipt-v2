import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ImportProductsModal from "../components/ImportProductsModal.jsx";
import { money } from "../components/ItemsEditor.jsx";

const emptyForm = {
  name: "",
  item_type: "product",
  sku: "",
  hsn_sac: "",
  description: "",
  unit: "unit",
  price: 0,
  tax_rate: 0,
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | product | service
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .listProducts(search, typeFilter === "all" ? undefined : typeFilter)
      .then(setProducts)
      .catch((e) => setError(e.message));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

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
    setForm({ ...emptyForm, ...product });
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
    if (!confirm("Archive this item?")) return;
    await api.archiveProduct(id);
    load();
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Products / Services</h1>
          <p className="text-sm text-ink-soft">Catalog items you can drop straight into a document.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setImportOpen(true)}>
            Import CSV
          </button>
          <button className="btn-primary" onClick={openCreate}>
            + New item
          </button>
        </div>
      </header>

      <div className="mb-4 flex items-center justify-between gap-4">
        <input
          className="field-input max-w-sm"
          placeholder="Search products / services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          {["all", "product", "service"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                typeFilter === t
                  ? "border-ink bg-ink text-paper"
                  : "border-paper-line bg-white text-ink-soft hover:border-ink/40"
              }`}
            >
              {t === "all" ? "All" : `${t}s`}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Type</th>
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
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      p.item_type === "service" ? "bg-ledger-navy/10 text-ledger-navy" : "bg-ledger-green/10 text-ledger-green"
                    }`}
                  >
                    {p.item_type || "product"}
                  </span>
                </td>
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
                <td colSpan={8} className="px-4 py-8 text-center text-ink-soft">
                  Nothing here yet. Add one manually, or import a CSV if you have a lot to add.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit item" : "New item"}>
        {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="field-label">Type</label>
            <div className="flex gap-2">
              {["product", "service"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, item_type: t })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize ${
                    form.item_type === t
                      ? "border-ledger-navy bg-ledger-navy/5 text-ledger-navy"
                      : "border-paper-line bg-white text-ink-soft"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
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
              placeholder={form.item_type === "service" ? "e.g. 9983" : "e.g. 998361"}
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
              {editingId ? "Save changes" : "Create item"}
            </button>
          </div>
        </form>
      </Modal>

      <ImportProductsModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </div>
  );
}
