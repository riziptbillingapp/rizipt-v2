import { useEffect, useState } from "react";
import { lineTotals, money } from "./ItemsEditor.jsx";
import { buildUpiUri, generateQrDataUrl } from "../utils/upiQr.js";
import { DEFAULT_BRAND_COLOR } from "../utils/color.js";

const TITLE = {
  quotation: "QUOTATION",
  invoice: "TAX INVOICE",
  bill: "RECEIPT",
};

const DATE_LABEL = {
  quotation: "Valid Till",
  invoice: "Due Date",
  bill: "Payment",
};

const TOTAL_LABEL = {
  quotation: "Net Payable",
  invoice: "Net Payable",
  bill: "Amount Received",
};

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * docType: "quotation" | "invoice" | "bill"
 * doc: the quotation/invoice/bill record (with .items already parsed)
 * company: company_profile record
 * customer: customer record
 */
export default function DocumentPreview({ docType, doc, company, customer, previewRef }) {
  const [qr, setQr] = useState(null);
  const brand = company?.brand_color || DEFAULT_BRAND_COLOR;
  // A bill/receipt records money already received — showing a "scan to pay"
  // QR on it would ask the customer to pay again for something they just paid.
  const isReceipt = docType === "bill";

  useEffect(() => {
    if (isReceipt || !company?.upi_id) return setQr(null);
    const uri = buildUpiUri({
      upiId: company.upi_id,
      payeeName: company.name,
      amount: doc.grand_total,
      note: doc.doc_number,
    });
    generateQrDataUrl(uri).then(setQr);
  }, [isReceipt, company?.upi_id, company?.name, doc.grand_total, doc.doc_number]);

  const items = doc.items || [];
  const secondaryDate = docType === "quotation" ? doc.valid_until : docType === "invoice" ? doc.due_date : doc.issue_date;

  const subtotal = items.reduce((s, it) => s + lineTotals(it).gross, 0);
  const discountTotal = items.reduce((s, it) => s + lineTotals(it).discountAmt, 0);
  const taxTotal = items.reduce((s, it) => s + lineTotals(it).tax, 0);
  const actual = subtotal - discountTotal + taxTotal;
  const roundOff = doc.grand_total - actual;

  return (
    <div
      ref={previewRef}
      className="mx-auto w-[794px] bg-white p-10 text-ink"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: brand }}>
        <div className="flex gap-4">
          {company?.logo_url && (
            <img src={company.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-contain" />
          )}
          <div>
            <h1 className="text-lg font-bold uppercase tracking-tight" style={{ color: brand }}>
              {company?.name}
            </h1>
            <p className="mt-1 max-w-sm text-[11px] leading-snug text-ink-soft">
              {[company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pincode]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p className="text-[11px] text-ink-soft">
              {[company?.phone && `Ph: ${company.phone}`, company?.email && `Email: ${company.email}`]
                .filter(Boolean)
                .join(" | ")}
            </p>
            {company?.website && <p className="text-[11px] text-ink-soft">Web: {company.website}</p>}
            <p className="text-[11px] font-medium text-ink">
              {company?.gstin && <>GSTIN: {company.gstin} </>}
              {company?.pan && <>&nbsp;PAN: {company.pan}</>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="font-display text-2xl font-bold tracking-wide" style={{ color: brand }}>
            {TITLE[docType]}
          </h2>
          <p className="mt-1 font-mono text-xs text-ink-soft">No: {doc.doc_number}</p>
          <p className="font-mono text-xs text-ink-soft">Date: {fmtDate(doc.issue_date)}</p>
          {secondaryDate && (
            <p className="font-mono text-xs text-ink-soft">
              {DATE_LABEL[docType]}: {fmtDate(secondaryDate)}
            </p>
          )}
        </div>
      </div>

      {/* Bill to */}
      <div className="mt-4 border-l-4 bg-paper/60 px-4 py-3" style={{ borderColor: brand }}>
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: brand }}>
          Bill To
        </p>
        <p className="font-semibold text-ink">{customer?.name}</p>
        <p className="max-w-md text-[11px] leading-snug text-ink-soft">
          {[customer?.billing_address, customer?.phone && `Ph: ${customer.phone}`, customer?.email && `Email: ${customer.email}`]
            .filter(Boolean)
            .join(" | ")}
        </p>
        {customer?.gstin && <p className="text-[11px] font-medium text-ink">GSTIN: {customer.gstin}</p>}
      </div>

      {/* Items table */}
      <table className="mt-4 w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-white" style={{ backgroundColor: brand }}>
            <th className="px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Description</th>
            <th className="px-2 py-2 font-semibold">HSN/SAC</th>
            <th className="px-2 py-2 text-right font-semibold">Qty</th>
            <th className="px-2 py-2 font-semibold">Unit</th>
            <th className="px-2 py-2 text-right font-semibold">Rate</th>
            <th className="px-2 py-2 text-right font-semibold">Disc%</th>
            <th className="px-2 py-2 text-right font-semibold">GST%</th>
            <th className="px-2 py-2 text-right font-semibold">Taxable</th>
            <th className="px-2 py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const { taxable, total } = lineTotals(it);
            return (
              <tr key={idx} className="border-b border-paper-line">
                <td className="px-2 py-2 align-top">{idx + 1}</td>
                <td className="px-2 py-2 align-top">
                  {it.name}
                  {it.description && <div className="text-[10px] text-ink-soft">{it.description}</div>}
                </td>
                <td className="px-2 py-2 align-top text-ink-soft">{it.hsn_sac || "—"}</td>
                <td className="px-2 py-2 text-right align-top">{it.quantity}</td>
                <td className="px-2 py-2 align-top text-ink-soft">{it.unit || "pcs"}</td>
                <td className="px-2 py-2 text-right align-top">{money(it.unit_price)}</td>
                <td className="px-2 py-2 text-right align-top">{it.discount_percent ? `${it.discount_percent}%` : "—"}</td>
                <td className="px-2 py-2 text-right align-top">{it.tax_rate}%</td>
                <td className="px-2 py-2 text-right align-top">{money(taxable)}</td>
                <td className="px-2 py-2 text-right align-top font-semibold">{money(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-3 flex justify-end">
        <div className="w-64 text-[11px]">
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">Subtotal (excl. GST)</span>
            <span>{money(subtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-ink-soft">Discount</span>
              <span>-{money(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">Total GST</span>
            <span>{money(taxTotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">Actual Amount</span>
            <span>{money(actual)}</span>
          </div>
          {Math.abs(roundOff) > 0.001 && (
            <div className="flex justify-between py-1 text-ledger-red">
              <span>Round Off ({roundOff >= 0 ? "+" : ""}{money(roundOff)})</span>
              <span>{roundOff >= 0 ? "+" : ""}{money(roundOff)}</span>
            </div>
          )}
          <div
            className="flex justify-between border-t-2 py-1.5 text-sm font-bold"
            style={{ borderColor: brand, color: brand }}
          >
            <span>{TOTAL_LABEL[docType]}</span>
            <span>₹ {money(doc.grand_total)}</span>
          </div>
        </div>
      </div>

      {/* Payment details: a receipt shows how payment was already received (no QR, no
          invitation to pay). A quotation/invoice shows how to pay, with a UPI QR. */}
      {isReceipt ? (
        <div className="mt-6 flex items-center justify-between rounded-md border border-ledger-green/30 bg-ledger-green/5 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ledger-green">Payment Received</p>
            <p className="text-[11px] text-ink">
              Via {(doc.payment_method || "cash").replace("_", " ")}
              {doc.payment_reference ? ` · Ref: ${doc.payment_reference}` : ""}
            </p>
          </div>
          <span className="stamp stamp-paid">Paid in full</span>
        </div>
      ) : (
        (company?.bank_name || company?.upi_id) && (
          <div className="mt-6 flex items-start justify-between border-t border-paper-line pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ledger-green">
                Bank / Payment Details
              </p>
              <table className="mt-1 text-[11px]">
                <tbody>
                  {company?.bank_name && (
                    <tr>
                      <td className="pr-3 text-ink-soft">Bank</td>
                      <td>{company.bank_name}</td>
                    </tr>
                  )}
                  {company?.bank_account_no && (
                    <tr>
                      <td className="pr-3 text-ink-soft">A/C No</td>
                      <td className="font-mono">{company.bank_account_no}</td>
                    </tr>
                  )}
                  {company?.bank_ifsc && (
                    <tr>
                      <td className="pr-3 text-ink-soft">IFSC</td>
                      <td className="font-mono">{company.bank_ifsc}</td>
                    </tr>
                  )}
                  {company?.upi_id && (
                    <tr>
                      <td className="pr-3 text-ink-soft">UPI</td>
                      <td className="font-mono">{company.upi_id}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {qr && (
              <div className="flex flex-col items-center">
                <img src={qr} alt="Scan to pay via UPI" className="h-24 w-24" />
                <span className="mt-1 text-[9px] text-ink-soft">Scan to pay</span>
              </div>
            )}
          </div>
        )
      )}

      {/* Terms + signature */}
      <div className="mt-6 flex items-end justify-between border-t border-paper-line pt-4">
        <div className="max-w-xs">
          {doc.terms && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Terms and Conditions</p>
              <p className="whitespace-pre-line text-[10px] leading-snug text-ink-soft">{doc.terms}</p>
            </>
          )}
          {doc.notes && <p className="mt-2 text-[10px] italic text-ink-soft">{doc.notes}</p>}
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium text-ink">For {company?.name}</p>
          <div className="mt-8 w-36 border-t border-ink/40 pt-1 text-[10px] text-ink-soft">Authorised Signatory</div>
        </div>
      </div>

      <p className="mt-6 text-center text-[9px] text-ink-soft">
        This is a computer-generated document. No physical signature required.
      </p>
    </div>
  );
}
