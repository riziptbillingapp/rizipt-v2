import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { hexToRgb, DEFAULT_BRAND_COLOR } from "./color.js";

const INK = [28, 36, 48];
const INK_SOFT = [86, 95, 110];
const LINE = [231, 224, 208];
const WHITE = [255, 255, 255];

const STATUS_COLORS = {
  on_track: [22, 163, 74],
  at_risk: [217, 119, 6],
  delayed: [220, 38, 38],
  completed: [37, 99, 235],
  not_started: [156, 163, 175],
  in_progress: [37, 99, 235],
  blocked: [220, 38, 38],
  done: [22, 163, 74],
};

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

function labelize(s) {
  if (!s) return "-";
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function drawCompletionBar(pdf, x, y, width, height, percent, color) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  pdf.setFillColor(230, 227, 217);
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  if (pct > 0) {
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, (width * pct) / 100, height, height / 2, height / 2, "F");
  }
  pdf.setFontSize(7.5);
  pdf.setTextColor(...INK);
  pdf.text(`${pct}%`, x + width + 6, y + height - 0.5);
}

/**
 * Builds a crisp, real-text A4 Project Status Report PDF, matching the same
 * header/footer conventions as generateDocumentPdf.js. Completion bars are
 * drawn with pdf.roundedRect() fills — fully vector, not a canvas screenshot.
 */
export async function generateProjectStatusReportPdf({ doc, company }) {
  const NAVY = hexToRgb(company?.brand_color || DEFAULT_BRAND_COLOR);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // --- Header (same pattern as generateDocumentPdf.js) ---
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
      // skip broken logo
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...NAVY);
  pdf.text(String(company?.name || "").toUpperCase(), textX, headerTop + 12);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK_SOFT);
  pdf.text("Project Status Report", textX, headerTop + 24);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...NAVY);
  pdf.text("STATUS REPORT", pageWidth - margin, headerTop + 14, { align: "right" });

  pdf.setFont("courier", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...INK_SOFT);
  pdf.text(`Ref: ${doc.doc_number}`, pageWidth - margin, headerTop + 32, { align: "right" });
  pdf.text(`Date: ${fmtDate(doc.issue_date)}`, pageWidth - margin, headerTop + 44, { align: "right" });

  let y = headerTop + 60;
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(1.2);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 24;

  // --- Project meta ---
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(...INK);
  pdf.text(doc.project_name, margin, y);
  y += 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...INK_SOFT);
  if (doc.period_from || doc.period_to) {
    pdf.text(`Period: ${fmtDate(doc.period_from)} - ${fmtDate(doc.period_to)}`, margin, y);
    y += 14;
  }

  const statusColor = STATUS_COLORS[doc.overall_status] || NAVY;
  pdf.text("Overall status:", margin, y);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...statusColor);
  pdf.text(labelize(doc.overall_status), margin + 68, y);
  y += 18;

  // --- Overall completion bar ---
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...INK);
  pdf.text("Overall Completion", margin, y);
  y += 8;
  drawCompletionBar(pdf, margin, y, contentWidth - 50, 12, doc.overall_completion, statusColor);
  y += 28;

  if (doc.summary) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...INK_SOFT);
    const lines = pdf.splitTextToSize(doc.summary, contentWidth);
    pdf.text(lines, margin, y);
    y += lines.length * 12 + 14;
  }

  // --- Milestones / tasks table with per-row completion bars ---
  const items = doc.items || [];

  if (items.length) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Task", "Owner", "Status", "Due", "Completion"]],
      body: items.map((it, i) => [i + 1, it.task_name, it.owner || "-", labelize(it.status), it.due_date ? fmtDate(it.due_date) : "-", ""]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, textColor: INK, cellPadding: 6, lineColor: LINE, lineWidth: 0.5, valign: "middle" },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 },
        4: { cellWidth: 60 },
        5: { cellWidth: 110 },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const item = items[data.row.index];
          const barColor = STATUS_COLORS[item.status] || NAVY;
          const barWidth = data.cell.width - 40;
          drawCompletionBar(pdf, data.cell.x + 4, data.cell.y + data.cell.height / 2 - 5, barWidth, 10, item.completion, barColor);
        }
      },
    });

    y = pdf.lastAutoTable.finalY + 26;
  }

  if (y > pageHeight - 160) {
    pdf.addPage();
    y = margin;
  }

  // --- Signature block, matching Letterhead / invoice pattern ---
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...INK);
  pdf.text(`For ${company?.name || ""}`, pageWidth - margin, y, { align: "right" });

  const sigBlockTop = y + 10;
  // Same realistic-size, height-driven seal sizing as generateLetterheadPdf.js
  // — see the comment there. Kept in sync so a seal/signature looks the same
  // size across every document type it appears on.
  const sealTargetHeight = 68;
  const sealMaxWidth = 160;
  const sigMaxW = 130;
  const sigMaxH = 56;
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
      // skip
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
      // skip
    }
  }

  const lineY = sigBlockTop + Math.max(sealH, sigH) + 8;
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.5);
  pdf.line(pageWidth - margin - 120, lineY, pageWidth - margin, lineY);
  pdf.setFontSize(7);
  pdf.setTextColor(...INK_SOFT);
  pdf.text(doc.prepared_by || "Authorised Signatory", pageWidth - margin, lineY + 10, { align: "right" });

  return pdf;
}

export async function downloadProjectStatusReportPdf({ doc, company }) {
  const pdf = await generateProjectStatusReportPdf({ doc, company });
  pdf.save(`${doc.doc_number}.pdf`);
}

export async function previewProjectStatusReportPdf({ doc, company }) {
  const pdf = await generateProjectStatusReportPdf({ doc, company });
  const blobUrl = pdf.output("bloburl");
  window.open(blobUrl, "_blank");
}
