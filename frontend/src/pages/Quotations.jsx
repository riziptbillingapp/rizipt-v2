import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import StatusStamp from "../components/StatusStamp.jsx";
import ItemsEditor, { emptyLine, money } from "../components/ItemsEditor.jsx";
import PreviewModal from "../components/PreviewModal.jsx";

const today = () => new Date().toISOString().slice(0, 10);

/** Handles both "New quotation" and "Edit quotation" — same form, different submit call. */
function QuotationFormModal({ open, onClose, onSaved, customers, products, editingDoc }) {
  const isEdit = !!editingDoc;
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [items, setItems] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingDoc) {
      setCustomerId(String(editingDoc.customer_id));
      setIssueDate(editingDoc.issue_date || today());
      setValidUntil(editingDoc.valid_until || "");
      setNotes(editingDoc.notes || "");
      setItems(editingDoc.items?.length ? editingDoc.items : [emptyLine()]);
      setError("");
    } else {
      api
        .getCompany()
        .then((c) => {
          const rate = Number(c?.default_tax_rate) || 0;
          setDefaultTaxRate(rate);
          setItems([emptyLine(rate)]);
        })
        .catch(() => {});
      setCustomerId("");
      setIssueDate(today());
      setValidUntil("");
      setNotes("");
      setError("");
    }
  }, [open, editingDoc]);

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) return setError("Select a customer first.");
    setSaving(true);
    setError("");
    try {
      const payload = {
        customer_id: Number(customerId),
        issue_date: issueDate,
        valid_until: validUntil || null,
        notes,
        items,
      };
      if (isEdit) {
        await api.updateQuotation(editingDoc.id, payload);
      } else {
        await api.createQuotation({ ...payload, status: "sent" });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit quotation ${editingDoc.doc_number}` : "New quotation"} wide>
      {isEdit && (
        <p className="mb-3 text-xs text-ledger-amber">
          Saving changes will reset this quotation's approval status back to pending, since the totals may change.
        </p>
      )}
      {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Customer *</label>
            <select className="field-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Issue date</label>
            <input type="date" className="field-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Valid until</label>
            <input type="date" className="field-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>

        <ItemsEditor items={items} onChange={setItems} products={products} defaultTaxRate={defaultTaxRate} />

        <div>
          <label className="field-label">Notes</label>
          <textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 border-t border-paper-line pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create quotation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QuotationDetailModal({ id, open, onClose, onChanged, customers, onEdit }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (open && id) {
      api.getQuotation(id).then(setDoc).catch((e) => setError(e.message));
    }
  }, [open, id]);

  const customer = doc ? customers.find((c) => c.id === doc.customer_id) : null;
  const customerName = customer?.name || "";

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const updated = await fn();
      setDoc(updated);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removePermanently = async () => {
    if (!confirm(`Permanently delete quotation ${doc.doc_number}? This can't be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteQuotation(doc.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!doc) return open ? <Modal open={open} onClose={onClose} title="Quotation">Loading…</Modal> : null;

  const isEditable = doc.status !== "converted";

  return (
    <Modal open={open} onClose={onClose} title={`Quotation ${doc.doc_number}`} wide>
      {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusStamp status={doc.status} />
        <span className="text-xs text-ink-soft">approval:</span>
        <StatusStamp status={doc.approval_status} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="field-label">Customer</div>
          <div className="text-ink">{customerName}</div>
        </div>
        <div>
          <div className="field-label">Issue date</div>
          <div className="text-ink">{doc.issue_date}</div>
        </div>
        <div>
          <div className="field-label">Valid until</div>
          <div className="text-ink">{doc.valid_until || "—"}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-paper-line">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Tax %</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, idx) => {
              const gross = it.quantity * it.unit_price;
              const discountAmt = gross * ((it.discount_percent || 0) / 100);
              const net = Math.max(gross - discountAmt, 0);
              const total = net + net * (it.tax_rate / 100);
              return (
                <tr key={idx} className="border-t border-paper-line">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(it.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.tax_rate}%</td>
                  <td className="px-3 py-2 text-right font-mono">{money(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <div className="w-56 space-y-1 font-mono text-sm">
          <div className="flex justify-between border-t border-paper-line pt-1 text-base font-semibold text-ink">
            <span>Total</span>
            <span>{money(doc.grand_total)}</span>
          </div>
        </div>
      </div>

      {doc.converted_to_invoice_id && (
        <p className="mt-3 text-sm text-ledger-navy">
          Converted to invoice #{doc.converted_to_invoice_id}. This quotation is now read-only.
        </p>
      )}

      {doc.discarded_at && (
        <p className="mt-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">
          This quotation is in the trash. Restore it to edit or convert it again, or delete it permanently.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-paper-line pt-4">
        {doc.discarded_at ? (
          <>
            <button className="btn-secondary" onClick={() => setPreviewOpen(true)}>
              Preview / Download PDF
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => act(() => api.restoreQuotation(doc.id))}>
              Restore
            </button>
            <button className="btn-danger" disabled={busy} onClick={removePermanently}>
              Delete permanently
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => setPreviewOpen(true)}>
              Preview / Download PDF
            </button>
            {isEditable && (
              <button className="btn-secondary" disabled={busy} onClick={() => onEdit(doc)}>
                Edit
              </button>
            )}
            {doc.approval_status === "pending" && (
              <>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => act(() => api.approveQuotation(doc.id))}
                >
                  Approve
                </button>
                <button className="btn-danger" disabled={busy} onClick={() => act(() => api.rejectQuotation(doc.id))}>
                  Reject
                </button>
              </>
            )}
            {doc.approval_status === "approved" && doc.status !== "converted" && (
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => act(() => api.convertQuotationToInvoice(doc.id, {}))}
              >
                Convert to invoice
              </button>
            )}
            <button
              className="btn-danger ml-auto"
              disabled={busy}
              onClick={() => act(() => api.discardQuotation(doc.id))}
            >
              Move to trash
            </button>
          </>
        )}
      </div>

      <PreviewModal
        docType="quotation"
        doc={doc}
        customer={customer}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </Modal>
  );
}

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [error, setError] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  const load = () => api.listQuotations(showTrash).then(setQuotations).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
  }, [showTrash]);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || "—";

  const openCreate = () => {
    setEditingDoc(null);
    setFormOpen(true);
  };

  const openEdit = (doc) => {
    setDetailId(null);
    setEditingDoc(doc);
    setFormOpen(true);
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Quotations</h1>
          <p className="text-sm text-ink-soft">Approve a quotation, then convert it straight into an invoice.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowTrash((v) => !v)}>
            {showTrash ? "Back to quotations" : "Trash"}
          </button>
          {!showTrash && (
            <button className="btn-primary" onClick={openCreate} disabled={customers.length === 0}>
              + New quotation
            </button>
          )}
        </div>
      </header>

      {!showTrash && customers.length === 0 && (
        <p className="mb-4 text-sm text-ledger-amber">Add a customer first before creating a quotation.</p>
      )}
      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}
      {showTrash && (
        <p className="mb-4 text-sm text-ink-soft">
          Discarded quotations. Open one to restore it or delete it permanently.
        </p>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Number</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Approval</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr
                key={q.id}
                className="cursor-pointer border-t border-paper-line hover:bg-paper/60"
                onClick={() => setDetailId(q.id)}
              >
                <td className="doc-number px-4 py-3">{q.doc_number}</td>
                <td className="px-4 py-3 text-ink">{customerName(q.customer_id)}</td>
                <td className="px-4 py-3 text-ink-soft">{q.issue_date}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(q.grand_total)}</td>
                <td className="px-4 py-3">
                  <StatusStamp status={q.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusStamp status={q.approval_status} />
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  {showTrash ? "Trash is empty." : "No quotations yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <QuotationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        customers={customers}
        products={products}
        editingDoc={editingDoc}
      />
      <QuotationDetailModal
        id={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        customers={customers}
        onEdit={openEdit}
      />
    </div>
  );
}
