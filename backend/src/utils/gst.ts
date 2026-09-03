// GST state codes as used in the first two digits of every GSTIN, and as
// the "place of supply" code on every GST return. Source: CBIC state code
// list. Kept here as the single source of truth for both the API and any
// dropdown the frontend needs.
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** Extracts the 2-digit GST state code from the start of a GSTIN, or null if it doesn't look like a GSTIN. */
export function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const clean = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z0-9]{13}$/.test(clean)) return null;
  return clean.slice(0, 2);
}

export interface TaxSplit {
  is_interstate: boolean;
  cgst: number;
  sgst: number;
  igst: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Splits a total tax amount into CGST+SGST (intra-state) or IGST
 * (inter-state), based on the seller's home state vs the document's place
 * of supply. Falls back to treating missing/unknown codes as intra-state,
 * since that's the far more common case for a small business and avoids
 * silently mis-classifying supplies as inter-state.
 */
export function splitTax(taxTotal: number, homeStateCode: string | null | undefined, placeOfSupply: string | null | undefined): TaxSplit {
  const home = homeStateCode || null;
  const pos = placeOfSupply || home; // unknown POS defaults to home state (intra-state)
  const isInterstate = !!(home && pos && home !== pos);

  if (isInterstate) {
    return { is_interstate: true, cgst: 0, sgst: 0, igst: round2(taxTotal) };
  }
  const half = round2(taxTotal / 2);
  return { is_interstate: false, cgst: half, sgst: round2(taxTotal - half), igst: 0 };
}

/** B2C Large threshold per CBIC rules — inter-state B2C invoices above this value get their own GSTR-1 section. Verify against the current threshold before filing, as CBIC has changed this figure over time. */
export const B2C_LARGE_THRESHOLD = 100000;
