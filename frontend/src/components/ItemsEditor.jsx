const emptyLine = () => ({
  product_id: null,
  name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  tax_rate: 0,
  discount: 0,
});

function money(n) {
  return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeTotals(items) {
  let subtotal = 0,
    discount_total = 0,
    tax_total = 0;
  for (const item of items) {
    const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    const net = Math.max(gross - (Number(item.discount) || 0), 0);
    const tax = net * ((Number(item.tax_rate) || 0) / 100);
    subtotal += gross;
    discount_total += Number(item.discount) || 0;
    tax_total += tax;
  }
  return { subtotal, discount_total, tax_total, grand_total: subtotal - discount_total + tax_total };
}

export default function ItemsEditor({ items, onChange, products = [] }) {
  const update = (idx, field, value) => {
    const next = items.slice();
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const addLine = () => onChange([...items, emptyLine()]);
  const removeLine = (idx) => onChange(items.filter((_, i) => i !== idx));

  const applyProduct = (idx, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    if (!product) return update(idx, "product_id", null);
    const next = items.slice();
    next[idx] = {
      ...next[idx],
      product_id: product.id,
      name: product.name,
      unit_price: product.price,
      tax_rate: product.tax_rate,
    };
    onChange(next);
  };

  const totals = computeTotals(items);

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-paper-line">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="w-20 px-2 py-2 font-semibold">Qty</th>
              <th className="w-28 px-2 py-2 font-semibold">Price</th>
              <th className="w-24 px-2 py-2 font-semibold">Tax %</th>
              <th className="w-24 px-2 py-2 font-semibold">Discount</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">Line total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
              const net = Math.max(gross - (Number(item.discount) || 0), 0);
              const lineTotal = net + net * ((Number(item.tax_rate) || 0) / 100);
              return (
                <tr key={idx} className="border-t border-paper-line align-top">
                  <td className="px-3 py-2">
                    {products.length > 0 && (
                      <select
                        className="field-input mb-1 text-xs"
                        value={item.product_id ?? ""}
                        onChange={(e) => applyProduct(idx, e.target.value)}
                      >
                        <option value="">Custom line item…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className="field-input"
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => update(idx, "name", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      className="field-input"
                      value={item.quantity}
                      onChange={(e) => update(idx, "quantity", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field-input"
                      value={item.unit_price}
                      onChange={(e) => update(idx, "unit_price", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      className="field-input"
                      value={item.tax_rate}
                      onChange={(e) => update(idx, "tax_rate", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field-input"
                      value={item.discount}
                      onChange={(e) => update(idx, "discount", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-ink">{money(lineTotal)}</td>
                  <td className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-ink-soft hover:text-ledger-red"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-ink-soft">
                  No line items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addLine} className="btn-secondary mt-3">
        + Add line item
      </button>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 font-mono text-sm">
          <div className="flex justify-between text-ink-soft">
            <span>Subtotal</span>
            <span>{money(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-ink-soft">
            <span>Discount</span>
            <span>-{money(totals.discount_total)}</span>
          </div>
          <div className="flex justify-between text-ink-soft">
            <span>Tax</span>
            <span>{money(totals.tax_total)}</span>
          </div>
          <div className="flex justify-between border-t border-paper-line pt-1 text-base font-semibold text-ink">
            <span>Total</span>
            <span>{money(totals.grand_total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export { emptyLine, money };
