import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import StatusStamp from "../components/StatusStamp.jsx";
import ItemsEditor, { emptyLine, money } from "../components/ItemsEditor.jsx";
import PreviewModal from "../components/PreviewModal.jsx";

const today = () => new Date().toISOString().slice(0, 10);

function CreateInvoiceModal({ open, onClose, onCreated, customers, products }) {
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [advanceReceived, setAdvanceReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [items, setItems] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
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
      setDueDate("");
      setAdvanceReceived("");
      setNotes("");
      setError("");
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) return setError("Select a customer first.");
    setSaving(true);
    setError("");
    try {
      await api.createInvoice({
        customer_id: Number(customerId),
        issue_date: issueDate,
        due_date: dueDate || null,
        amount_paid: Number(advanceReceived) || 0,
        notes,
        items,
        status: "sent",
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New invoice (direct)" wide>
      <p className="mb-3 text-xs text-ink-soft">
        For a walk-in invoice not tied to a quotation. To invoice an approved quotation, convert it from the
        Quotations tab instead.
      </p>
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
            <label className="field-label">Due date</label>
            <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Advance received (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="field-input"
              placeholder="0.00"
              value={advanceReceived}
              onChange={(e) => setAdvanceReceived(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Shown as a deduction on the PDF, with the balance printed as "Balance Due".
            </p>
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
            {saving ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceDetailModal({ id, open, onClose, onChanged, customers }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [advanceInput, setAdvanceInput] = useState("");
  const [savingAdvance, setSavingAdvance] = useState(false);

  useEffect(() => {
    if (open && id) {
      api.getInvoice(id).then((d) => {
        setDoc(d);
        setAdvanceInput(String(d.amount_paid || ""));
      }).catch((e) => setError(e.message));
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

  if (!doc) return open ? <Modal open={open} onClose={onClose} title="Invoice">Loading…</Modal> : null;

  const canEditAdvance = doc.status !== "converted";

  const saveAdvance = async () => {
    setSavingAdvance(true);
    setError("");
    try {
      const updated = await api.updateInvoice(doc.id, { amount_paid: Number(advanceInput) || 0 });
      setDoc(updated);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingAdvance(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Invoice ${doc.doc_number}`} wide>
      {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusStamp status={doc.status} />
        <span className="text-xs text-ink-soft">approval:</span>
        <StatusStamp status={doc.approval_status} />
        {doc.source_type === "quotation" && (
          <span className="ml-2 text-xs text-ink-soft">
            Sourced from quotation #{doc.quotation_id}
          </span>
        )}
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
          <div className="field-label">Due date</div>
          <div className="text-ink">{doc.due_date || "—"}</div>
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
              const net = Math.max(gross - it.discount, 0);
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
        <div className="w-64 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-soft">Advance received</span>
            {canEditAdvance ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="field-input w-24 py-1 text-right font-mono"
                  value={advanceInput}
                  onChange={(e) => setAdvanceInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  disabled={savingAdvance || Number(advanceInput) === Number(doc.amount_paid || 0)}
                  onClick={saveAdvance}
                >
                  {savingAdvance ? "…" : "Save"}
                </button>
              </div>
            ) : (
              <span className="font-mono">{money(doc.amount_paid)}</span>
            )}
          </div>
          <div className="flex justify-between border-t border-paper-line pt-2 font-mono">
            <span className="text-ink-soft">Total</span>
            <span>{money(doc.grand_total)}</span>
          </div>
          <div className="flex justify-between border-t border-paper-line pt-2 text-base font-semibold text-ink">
            <span>Balance due</span>
            <span className="font-mono">{money(doc.grand_total - (Number(doc.amount_paid) || 0))}</span>
          </div>
        </div>
      </div>

      {doc.converted_to_bill_id && (
        <p className="mt-3 text-sm text-ledger-navy">
          Converted to bill #{doc.converted_to_bill_id}. This invoice is now read-only.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-paper-line pt-4">
        <button className="btn-secondary" onClick={() => setPreviewOpen(true)}>
          Preview / Download PDF
        </button>
        {doc.approval_status === "pending" && (
          <>
            <button className="btn-primary" disabled={busy} onClick={() => act(() => api.approveInvoice(doc.id))}>
              Approve
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => act(() => api.rejectInvoice(doc.id))}>
              Reject
            </button>
          </>
        )}
        {doc.approval_status === "approved" && doc.status !== "converted" && (
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => act(() => api.convertInvoiceToBill(doc.id, { payment_method: "cash" }))}
          >
            Convert to bill / receipt
          </button>
        )}
      </div>

      <PreviewModal
        docType="invoice"
        doc={doc}
        customer={customer}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </Modal>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.listInvoices().then(setInvoices).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
  }, []);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Invoices</h1>
          <p className="text-sm text-ink-soft">Direct invoices, or ones converted from an approved quotation.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)} disabled={customers.length === 0}>
          + New invoice
        </button>
      </header>

      {error && <div className="mb-4 rounded-md bg-ledger-red/10 px-4 py-2 text-sm text-ledger-red">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Number</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Approval</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="cursor-pointer border-t border-paper-line hover:bg-paper/60"
                onClick={() => setDetailId(inv.id)}
              >
                <td className="doc-number px-4 py-3">{inv.doc_number}</td>
                <td className="px-4 py-3 text-ink">{customerName(inv.customer_id)}</td>
                <td className="px-4 py-3 text-xs text-ink-soft">
                  {inv.source_type === "quotation" ? `Quotation #${inv.quotation_id}` : "Direct"}
                </td>
                <td className="px-4 py-3 text-ink-soft">{inv.issue_date}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">{money(inv.grand_total)}</td>
                <td className="px-4 py-3">
                  <StatusStamp status={inv.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusStamp status={inv.approval_status} />
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateInvoiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
        customers={customers}
        products={products}
      />
      <InvoiceDetailModal
        id={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        customers={customers}
      />
    </div>
  );
}
