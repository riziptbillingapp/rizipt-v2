import jsPDF from "jspdf";
import { hexToRgb, DEFAULT_BRAND_COLOR } from "./color.js";

const INK = [28, 36, 48];
const INK_SOFT = [86, 95, 110];
const LINE = [231, 224, 208];

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Builds a crisp, real-text A4 letterhead PDF — same header/footer pattern
 * (logo, address, brand color, signature block) as generateDocumentPdf.js,
 * so a Letterhead document looks like it belongs to the same document family
 * as your Quotations/Invoices/Bills. Returns a jsPDF instance.
 */
export async function generateLetterheadPdf({ doc, company }) {
  const NAVY = hexToRgb(company?.brand_color || DEFAULT_BRAND_COLOR);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // --- Header: logo + company block (left), doc meta (right) — matches
  //     generateDocumentPdf.js's header exactly, field-for-field. ---
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
  const rightBlockWidth = 150;
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

  // Right-aligned doc meta block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...NAVY);
  pdf.text("LETTERHEAD", pageWidth - margin, headerTop + 14, { align: "right" });

  pdf.setFont("courier", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...INK_SOFT);
  let metaY = headerTop + 32;
  pdf.text(`Ref: ${doc.doc_number}`, pageWidth - margin, metaY, { align: "right" });
  metaY += 12;
  pdf.text(`Date: ${fmtDate(doc.issue_date)}`, pageWidth - margin, metaY, { align: "right" });

  let y = Math.max(addrY, metaY, headerTop + 48) + 10;

  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(1.2);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 26;

  // --- Recipient ---
  if (doc.recipient_name) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...INK_SOFT);
    pdf.text("To,", margin, y);
    y += 13;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...INK);
    pdf.text(doc.recipient_name, margin, y);
    y += 13;
    if (doc.recipient_address) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...INK_SOFT);
      const lines = pdf.splitTextToSize(doc.recipient_address, 260);
      pdf.text(lines, margin, y);
      y += lines.length * 12;
    }
    y += 14;
  }

  // --- Title / subject ---
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(...INK);
  pdf.text(doc.title, margin, y);
  y += 18;

  if (doc.subject) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.setTextColor(...INK_SOFT);
    pdf.text(`Subject: ${doc.subject}`, margin, y);
    y += 20;
  }

  // --- Body content (rich text stripped to plain text for now) ---
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...INK);
  const bodyLines = pdf.splitTextToSize(stripHtml(doc.body_content), contentWidth);
  bodyLines.forEach((line) => {
    if (y > pageHeight - 120) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 14;
  });

  y += 30;
  if (y > pageHeight - 160) {
    pdf.addPage();
    y = margin;
  }

  // --- Signature block: "For {company}" + signature image + seal image,
  //     matching generateDocumentPdf.js's "Authorised Signatory" placement,
  //     extended with the seal/signature images from Company Profile. ---
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK);
  pdf.text(`For ${company?.name || ""}`, pageWidth - margin, y, { align: "right" });

  const sigBlockTop = y + 10;
  // Real stamps/signatures read as roughly 1"-1.5" across on a printed page —
  // these sizes (in points, 72pt = 1") aim for that, now that the uploaded
  // images are pre-cropped to their actual ink content rather than including
  // a lot of blank scan margin.
  //
  // Seals are usually WIDE and SHORT (a rectangular or oval stamp with text
  // running across it), not square — so sizing them like the signature (fit
  // into an equal w/h box) constrains them by their long dimension and makes
  // them look small. Instead, size the seal by TARGET HEIGHT so it reads at
  // the same visual weight as the signature, and only cap width if that
  // would make it wide enough to collide with the text above.
  const sealTargetHeight = 68;
  const sealMaxWidth = 160;
  const sigMaxW = 130; // ~1.8"
  const sigMaxH = 56; // ~0.78"
  let sealW = 0;
  let sealH = 0;

  if (company?.seal_url) {
    try {
      const dims = await getImageDimensions(company.seal_url);
      let h = sealTargetHeight;
      let w = h * (dims.width / dims.height);
      if (w > sealMaxWidth) {
        w = sealMaxWidth;
        h = w * (dims.height / dims.width);
      }
      sealW = w;
      sealH = h;
      pdf.addImage(company.seal_url, imageFormat(company.seal_url), pageWidth - margin - sigMaxW - 16 - w, sigBlockTop, w, h);
    } catch {
      // skip if undecodable
    }
  }

  let sigH = sigMaxH;
  if (company?.signature_url) {
    try {
      const dims = await getImageDimensions(company.signature_url);
      let w = sigMaxW;
      let h = (sigMaxW * dims.height) / dims.width;
      if (h > sigMaxH) {
        h = sigMaxH;
        w = (sigMaxH * dims.width) / dims.height;
      }
      sigH = h;
      pdf.addImage(company.signature_url, imageFormat(company.signature_url), pageWidth - margin - w, sigBlockTop, w, h);
    } catch {
      // skip if undecodable
    }
  }

  const lineY = sigBlockTop + Math.max(sealH, sigH) + 8;
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.5);
  pdf.line(pageWidth - margin - 120, lineY, pageWidth - margin, lineY);
  pdf.setFontSize(7);
  pdf.setTextColor(...INK_SOFT);
  pdf.text(doc.prepared_by || "Authorised Signatory", pageWidth - margin, lineY + 10, { align: "right" });

  pdf.setDrawColor(...LINE);
  pdf.setFontSize(7);
  pdf.setTextColor(...INK_SOFT);
  pdf.text(
    "This is a computer-generated document.",
    pageWidth / 2,
    pageHeight - 24,
    { align: "center" }
  );

  return pdf;
}

export async function downloadLetterheadPdf({ doc, company }) {
  const pdf = await generateLetterheadPdf({ doc, company });
  pdf.save(`${doc.doc_number}.pdf`);
}

export async function previewLetterheadPdf({ doc, company }) {
  const pdf = await generateLetterheadPdf({ doc, company });
  const blobUrl = pdf.output("bloburl");
  window.open(blobUrl, "_blank");
}
