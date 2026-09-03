// Mirrors backend/src/utils/gst.ts GST_STATE_CODES — keep the two in sync.
export const GST_STATES = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other Territory"],
];

export const GST_STATE_NAME = Object.fromEntries(GST_STATES.map(([code, name]) => [code, name]));

/** Extracts the 2-digit GST state code from the start of a GSTIN, or null if it doesn't look like one. */
export function stateCodeFromGstin(gstin) {
  if (!gstin) return null;
  const clean = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z0-9]{13}$/.test(clean)) return null;
  return clean.slice(0, 2);
}
