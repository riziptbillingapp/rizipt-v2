import QRCode from "qrcode";

/** Builds a standard UPI payment deep link. Amount is optional (omit for a reusable "pay any amount" QR). */
export function buildUpiUri({ upiId, payeeName, amount, note }) {
  if (!upiId) return null;
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName);
  if (amount != null && amount !== "") params.set("am", Number(amount).toFixed(2));
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

export async function generateQrDataUrl(text) {
  if (!text) return null;
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: "#1C2430", light: "#FFFFFF" } });
  } catch {
    return null;
  }
}
