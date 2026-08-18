export interface LineItem {
  product_id?: number | null;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number; // percent, e.g. 18 for 18%
  discount: number; // flat amount off this line's pre-tax total
}

export interface Totals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Computes subtotal / discount / tax / grand total from a list of line items. */
export function computeTotals(items: LineItem[]): Totals {
  let subtotal = 0;
  let discount_total = 0;
  let tax_total = 0;

  for (const item of items || []) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const discount = Number(item.discount) || 0;
    const taxRate = Number(item.tax_rate) || 0;

    const lineGross = qty * price;
    const lineNet = Math.max(lineGross - discount, 0);
    const lineTax = lineNet * (taxRate / 100);

    subtotal += lineGross;
    discount_total += discount;
    tax_total += lineTax;
  }

  const grand_total = subtotal - discount_total + tax_total;

  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    tax_total: round2(tax_total),
    grand_total: round2(grand_total),
  };
}

export function normalizeItems(rawItems: unknown): LineItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((raw) => ({
    product_id: raw?.product_id ?? null,
    name: String(raw?.name ?? ""),
    description: raw?.description ? String(raw.description) : "",
    quantity: Number(raw?.quantity) || 0,
    unit_price: Number(raw?.unit_price) || 0,
    tax_rate: Number(raw?.tax_rate) || 0,
    discount: Number(raw?.discount) || 0,
  }));
}
