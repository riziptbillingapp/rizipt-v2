// pdf/generateProjectStatusReportPdf.js
// Native vector PDF. Completion bars are drawn with doc.rect() fills —
// fully vector, crisp at any zoom, no canvas screenshot involved.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_COLORS = {
  on_track: '#16a34a',
  at_risk: '#d97706',
  delayed: '#dc2626',
  completed: '#2563eb',
  not_started: '#9ca3af',
  in_progress: '#2563eb',
  blocked: '#dc2626',
  done: '#16a34a',
};

function drawCompletionBar(doc, x, y, width, height, percent, color) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  doc.setDrawColor('#e5e7eb');
  doc.setFillColor('#e5e7eb');
  doc.roundedRect(x, y, width, height, height / 2, height / 2, 'F');

  if (pct > 0) {
    doc.setFillColor(color);
    doc.roundedRect(x, y, (width * pct) / 100, height, height / 2, height / 2, 'F');
  }

  doc.setFontSize(8);
  doc.setTextColor('#111111');
  doc.text(`${pct}%`, x + width + 8, y + height - 1);
}

export function generateProjectStatusReportPdf(report, company) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const themeColor = company?.theme_color || '#1f2937';
  let y = 56;

  // --- Header ---
  if (company?.logo_base64) {
    try {
      doc.addImage(company.logo_base64, 'PNG', margin, y - 20, 50, 50);
    } catch (e) {}
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(themeColor);
  doc.text(company?.name || 'Company Name', company?.logo_base64 ? margin + 62 : margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#555555');
  doc.text('Project Status Report', company?.logo_base64 ? margin + 62 : margin, y + 15);

  doc.setFontSize(10);
  doc.setTextColor('#111111');
  doc.text(`Ref: ${report.doc_number}`, pageWidth - margin, y - 6, { align: 'right' });
  doc.text(`Date: ${formatDate(report.report_date)}`, pageWidth - margin, y + 10, { align: 'right' });

  y += 40;
  doc.setDrawColor(themeColor);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 26;

  // --- Project meta ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(report.project_name, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor('#374151');
  if (report.period_from || report.period_to) {
    doc.text(
      `Period: ${formatDate(report.period_from)} - ${formatDate(report.period_to)}`,
      margin,
      y
    );
    y += 14;
  }
  const statusColor = STATUS_COLORS[report.overall_status] || themeColor;
  doc.text('Overall status:', margin, y);
  doc.setTextColor(statusColor);
  doc.setFont('helvetica', 'bold');
  doc.text(labelize(report.overall_status), margin + 78, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#374151');
  y += 20;

  // --- Overall completion bar (large, prominent) ---
  doc.setFontSize(10);
  doc.setTextColor('#111111');
  doc.text('Overall Completion', margin, y);
  y += 8;
  drawCompletionBar(doc, margin, y, pageWidth - margin * 2 - 50, 14, report.overall_completion, statusColor);
  y += 34;

  if (report.summary) {
    doc.setFontSize(9.5);
    doc.setTextColor('#374151');
    const lines = doc.splitTextToSize(report.summary, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 16;
  }

  // --- Milestones / tasks table with per-row completion bars ---
  const items = report.items || [];

  if (items.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Task', 'Owner', 'Status', 'Due', 'Completion']],
      body: items.map((it, i) => [
        i + 1,
        it.task_name,
        it.owner || '-',
        labelize(it.status),
        it.due_date ? formatDate(it.due_date) : '-',
        '', // filled in by didDrawCell below
      ]),
      styles: { fontSize: 8.5, cellPadding: 6, valign: 'middle' },
      headStyles: { fillColor: themeColor, textColor: '#ffffff' },
      columnStyles: {
        0: { cellWidth: 20 },
        5: { cellWidth: 110 },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const item = items[data.row.index];
          const barColor = STATUS_COLORS[item.status] || themeColor;
          const barWidth = data.cell.width - 40;
          drawCompletionBar(
            doc,
            data.cell.x + 4,
            data.cell.y + data.cell.height / 2 - 5,
            barWidth,
            10,
            item.completion,
            barColor
          );
        }
      },
    });

    y = doc.lastAutoTable.finalY + 30;
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 56;
  }

  doc.setFontSize(9);
  doc.setTextColor('#6b7280');
  doc.text(`Prepared by: ${report.prepared_by || '-'}`, margin, y);

  return doc;
}

export function downloadProjectStatusReportPdf(report, company) {
  const doc = generateProjectStatusReportPdf(report, company);
  doc.save(`${report.doc_number}.pdf`);
}

export function previewProjectStatusReportPdf(report, company) {
  const doc = generateProjectStatusReportPdf(report, company);
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}

function labelize(s) {
  if (!s) return '-';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
