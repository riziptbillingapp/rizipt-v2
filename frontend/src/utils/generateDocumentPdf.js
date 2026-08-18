import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { lineTotals } from "../components/ItemsEditor.jsx";
import { buildUpiUri, generateQrDataUrl } from "./upiQr.js";

const TITLE = { quotation: "QUOTATION", invoice: "TAX INVOICE", bill: "RECEIPT" };
const DATE_LABEL = { quotation: "Valid Till", invoice: "Due Date", bill: "Payment Date" };

const NAVY = [35, 58, 94];
const INK = [28, 36, 48];
const INK_SOFT = [86, 95, 110];
const LINE = [231, 224, 208];
const WHITE = [255, 255, 255];
const GREEN = [47, 111, 78];
const RED = [184, 67, 59];

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function money(n) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function imageFormat(dataUrl) {
  if (!dataUrl) return "PNG";
  return /^data:image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Builds a crisp, real-text A4 PDF for a quotation/invoice/bill. Returns a jsPDF instance. */
export async function generateDocumentPdf({ docType, doc, company, customer }) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // --- Header: logo + company block (left), doc title block (right) ---
  const headerTop = margin;
  let textX = margin;

  if (company?.logo_url) {
    try {
      const dims = await getImageDimensions(company.logo_url);
      const size = 48;
      const w = dims.width >= dims.height ? size : (size * dims.width) / dims.height;
      const h = dims.height >= dims.width ? size : (size * dims.height) / dims.width;
      pdf.addImage(company.logo_url, imageFormat(company.logo_url), margin, headerTop, w, h);
      textX = margin + size + 12;
    } catch {
      // broken/undecodable logo — fall back to text-only header
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...NAVY);
  pdf.text(String(company?.name || "").toUpperCase(), textX, headerTop + 12);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK_SOFT);
  const addressLine = [company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pincode]
    .filter(Boolean)
    .join(", ");
  const rightBlockWidth = 200;
  const addressWrapped = pdf.splitTextToSize(addressLine, contentWidth - (textX - margin) - rightBlockWidth);
  let addrY = headerTop + 26;
  addressWrapped.slice(0, 2).forEach((line) => {
    pdf.text(line, textX, addrY);
    addrY += 10;
  });

  const contactLine = [company?.phone && `Ph: ${company.phone}`, company?.email && `Email: ${company.email}`]
    .filter(Boolean)
    .join("   |   ");
  if (contactLine) {
    pdf.text(contactLine, textX, addrY);
    addrY += 10;
  }
  if (company?.website) {
    pdf.text(`Web: ${company.website}`, textX, addrY);
    addrY += 10;
  }
  const idLine = [company?.gstin && `GSTIN: ${company.gstin}`, company?.pan && `PAN: ${company.pan}`]
    .filter(Boolean)
    .join("     ");
  if (idLine) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text(idLine, textX, addrY);
    addrY += 10;
  }

  // Right-aligned doc title block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(...NAVY);
  pdf.text(TITLE[docType] || "DOCUMENT", pageWidth - margin, headerTop + 14, { align: "right" });

  pdf.setFont("courier", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...INK_SOFT);
  let metaY = headerTop + 32;
  pdf.text(`No: ${doc.doc_number}`, pageWidth - margin, metaY, { align: "right" });
  metaY += 12;
  pdf.text(`Date: ${fmtDate(doc.issue_date)}`, pageWidth - margin, metaY, { align: "right" });
  const secondaryDate =
    docType === "quotation" ? doc.valid_until : docType === "invoice" ? doc.due_date : doc.issue_date;
  if (secondaryDate) {
    metaY += 12;
    pdf.text(`${DATE_LABEL[docType]}: ${fmtDate(secondaryDate)}`, pageWidth - margin, metaY, { align: "right" });
  }

  let y = Math.max(addrY, metaY, headerTop + 48) + 10;

  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(1.2);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 16;

  // --- Bill To ---
  const billToHeight = 48;
  pdf.setFillColor(250, 247, 239);
  pdf.rect(margin, y, contentWidth, billToHeight, "F");
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(2.5);
  pdf.line(margin, y, margin, y + billToHeight);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...NAVY);
  pdf.text("BILL TO", margin + 12, y + 13);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...INK);
  pdf.text(customer?.name || "", margin + 12, y + 25);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK_SOFT);
  const custLine = [
    customer?.billing_address,
    customer?.phone && `Ph: ${customer.phone}`,
    customer?.email && `Email: ${customer.email}`,
  ]
    .filter(Boolean)
    .join("  |  ");
  const custWrapped = pdf.splitTextToSize(custLine, contentWidth - 24);
  pdf.text(custWrapped.slice(0, 1), margin + 12, y + 36);

  if (customer?.gstin) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text(`GSTIN: ${customer.gstin}`, margin + 12, y + 46);
  }

  y += billToHeight + 16;

  // --- Items table ---
  const items = doc.items || [];
  const rows = items.map((it, idx) => {
    const { taxable, total } = lineTotals(it);
    const name = it.description ? `${it.name}\n${it.description}` : it.name;
    return [
      String(idx + 1),
      name,
      it.hsn_sac || "—",
      String(it.quantity),
      it.unit || "pcs",
      money(it.unit_price),
      it.discount_percent ? `${it.discount_percent}%` : "—",
      `${it.tax_rate}%`,
      money(taxable),
      money(total),
    ];
  });

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Description", "HSN/SAC", "Qty", "Unit", "Rate", "Disc%", "GST%", "Taxable", "Total"]],
    body: rows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: INK,
      cellPadding: 5,
      lineColor: LINE,
      lineWidth: 0.5,
      valign: "top",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 46, halign: "center" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 30 },
      5: { cellWidth: 46, halign: "right" },
      6: { cellWidth: 34, halign: "right" },
      7: { cellWidth: 30, halign: "right" },
      8: { cellWidth: 48, halign: "right" },
      9: { cellWidth: 54, halign: "right", fontStyle: "bold" },
    },
  });

  y = pdf.lastAutoTable.finalY + 12;

  // --- Totals ---
  const subtotal = items.reduce((s, it) => s + lineTotals(it).gross, 0);
  const discountTotal = items.reduce((s, it) => s + lineTotals(it).discountAmt, 0);
  const taxTotal = items.reduce((s, it) => s + lineTotals(it).tax, 0);
  const actual = subtotal - discountTotal + taxTotal;
  const roundOff = doc.grand_total - actual;

  const totalsX = pageWidth - margin - 200;
  let totalsY = y;
  const totalRow = (label, value, opts = {}) => {
    const size = opts.size || 9;
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(opts.color || INK_SOFT));
    pdf.text(label, totalsX, totalsY);
    pdf.text(value, pageWidth - margin, totalsY, { align: "right" });
    totalsY += size + 6;
  };

  totalRow("Subtotal (excl. GST)", money(subtotal));
  if (discountTotal > 0) totalRow("Discount", `-${money(discountTotal)}`);
  totalRow("Total GST", money(taxTotal));
  totalRow("Actual Amount", money(actual));
  if (Math.abs(roundOff) > 0.001) {
    totalRow("Round Off", `${roundOff >= 0 ? "+" : ""}${money(roundOff)}`, { color: RED });
  }

  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(1.2);
  pdf.line(totalsX, totalsY - 4, pageWidth - margin, totalsY - 4);
  totalsY += 6;
  totalRow("Net Payable", `Rs. ${money(doc.grand_total)}`, { bold: true, size: 12, color: NAVY });

  y = totalsY + 14;

  // --- Payment details ---
  if (company?.bank_name || company?.upi_id) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...GREEN);
    pdf.text("BANK / PAYMENT DETAILS", margin, y);

    let payY = y + 14;
    const bankRows = [
      company?.bank_name && ["Bank", company.bank_name],
      company?.bank_account_no && ["A/C No", company.bank_account_no],
      company?.bank_ifsc && ["IFSC", company.bank_ifsc],
      company?.upi_id && ["UPI", company.upi_id],
    ].filter(Boolean);

    pdf.setFontSize(8);
    bankRows.forEach(([label, value]) => {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...INK_SOFT);
      pdf.text(label, margin, payY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...INK);
      pdf.text(String(value), margin + 70, payY);
      payY += 12;
    });

    let qrBottom = y;
    if (company?.upi_id) {
      const uri = buildUpiUri({
        upiId: company.upi_id,
        payeeName: company.name,
        amount: doc.grand_total,
        note: doc.doc_number,
      });
      const qrDataUrl = await generateQrDataUrl(uri);
      if (qrDataUrl) {
        const qrSize = 70;
        const qrX = pageWidth - margin - qrSize;
        pdf.addImage(qrDataUrl, "PNG", qrX, y, qrSize, qrSize);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(...INK_SOFT);
        pdf.text("Scan to pay", qrX + qrSize / 2, y + qrSize + 10, { align: "center" });
        qrBottom = y + qrSize + 14;
      }
    }

    y = Math.max(payY, qrBottom) + 10;
  }

  // --- Terms + signature ---
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 16;

  const termsBottom = y;
  if (doc.terms) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...INK_SOFT);
    pdf.text("TERMS AND CONDITIONS", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const termsWrapped = pdf.splitTextToSize(doc.terms, 300);
    pdf.text(termsWrapped, margin, y + 12);
  }
  if (doc.notes) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.setTextColor(...INK_SOFT);
    const notesWrapped = pdf.splitTextToSize(doc.notes, 300);
    pdf.text(notesWrapped, margin, termsBottom + (doc.terms ? 44 : 12));
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK);
  pdf.text(`For ${company?.name || ""}`, pageWidth - margin, y, { align: "right" });
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.5);
  pdf.line(pageWidth - margin - 120, y + 40, pageWidth - margin, y + 40);
  pdf.setFontSize(7);
  pdf.setTextColor(...INK_SOFT);
  pdf.text("Authorised Signatory", pageWidth - margin, y + 50, { align: "right" });

  pdf.setFontSize(7);
  pdf.setTextColor(...INK_SOFT);
  pdf.text(
    "This is a computer-generated document. No physical signature required.",
    pageWidth / 2,
    pdf.internal.pageSize.getHeight() - 24,
    { align: "center" }
  );

  return pdf;
}
