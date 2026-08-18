export interface LineItem {
  product_id?: number | null;
  name: string;
  description?: string;
  hsn_sac?: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  tax_rate: number; // percent, e.g. 18 for 18%
  discount_percent: number; // percent off this line's pre-tax total, e.g. 40 for 40%
}

export interface Totals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  round_off: number;
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
    const discountPct = Number(item.discount_percent) || 0;
    const taxRate = Number(item.tax_rate) || 0;

    const lineGross = qty * price;
    const lineDiscountAmt = lineGross * (discountPct / 100);
    const lineNet = Math.max(lineGross - lineDiscountAmt, 0);
    const lineTax = lineNet * (taxRate / 100);

    subtotal += lineGross;
    discount_total += lineDiscountAmt;
    tax_total += lineTax;
  }

  const actual = subtotal - discount_total + tax_total;
  const grand_total = Math.round(actual);
  const round_off = round2(grand_total - actual);

  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    tax_total: round2(tax_total),
    grand_total: round2(grand_total),
    round_off,
  };
}

export function normalizeItems(rawItems: unknown): LineItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((raw: any) => ({
    product_id: raw?.product_id ?? null,
    name: String(raw?.name ?? ""),
    description: raw?.description ? String(raw.description) : "",
    hsn_sac: raw?.hsn_sac ? String(raw.hsn_sac) : "",
    quantity: Number(raw?.quantity) || 0,
    unit: raw?.unit ? String(raw.unit) : "pcs",
    unit_price: Number(raw?.unit_price) || 0,
    tax_rate: Number(raw?.tax_rate) || 0,
    discount_percent: Number(raw?.discount_percent ?? raw?.discount) || 0,
  }));
}
