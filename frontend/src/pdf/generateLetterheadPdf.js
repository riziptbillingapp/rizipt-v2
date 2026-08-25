// pdf/generateLetterheadPdf.js
// Native vector PDF, same approach as your invoice/quotation generators
// (jsPDF only, no html2canvas — avoids the blurry-raster issue you already fixed).
//
// `company` = your existing company profile object (logo base64, theme
// color, address, GSTIN etc.) — pass the same object you already load
// for invoices so branding stays consistent.

import { jsPDF } from 'jspdf';

export function generateLetterheadPdf(letterhead, company) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;

  const themeColor = company?.theme_color || '#1f2937';

  // --- Header / letterhead band ---
  if (company?.logo_base64) {
    try {
      doc.addImage(company.logo_base64, 'PNG', margin, y - 20, 60, 60);
    } catch (e) {
      // logo decode failure shouldn't block PDF generation
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(themeColor);
  doc.text(company?.name || 'Company Name', company?.logo_base64 ? margin + 72 : margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#555555');
  const addrLines = [company?.address, company?.city_state_pin, company?.gstin ? `GSTIN: ${company.gstin}` : null]
    .filter(Boolean);
  addrLines.forEach((line, i) => {
    doc.text(line, company?.logo_base64 ? margin + 72 : margin, y + 16 + i * 12);
  });

  y += 70;
  doc.setDrawColor(themeColor);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 30;

  // --- Doc meta ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#111111');
  doc.text(`Ref: ${letterhead.doc_number}`, margin, y);
  doc.text(`Date: ${formatDate(letterhead.doc_date)}`, pageWidth - margin, y, { align: 'right' });
  y += 24;

  if (letterhead.recipient_name) {
    doc.text('To,', margin, y);
    y += 14;
    doc.text(letterhead.recipient_name, margin, y);
    y += 14;
    if (letterhead.recipient_address) {
      const lines = doc.splitTextToSize(letterhead.recipient_address, 250);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 6;
    }
    y += 10;
  }

  // --- Title / subject ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(letterhead.title, margin, y);
  y += 20;

  if (letterhead.subject) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(`Subject: ${letterhead.subject}`, margin, y);
    y += 24;
  }

  // --- Body content ---
  // body_content is stored as sanitized HTML from a rich text editor.
  // Strip tags to plain text for now — swap in an HTML->PDF renderer
  // later if you need bold/bullets preserved in the PDF itself.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const plainText = stripHtml(letterhead.body_content);
  const bodyLines = doc.splitTextToSize(plainText, pageWidth - margin * 2);

  const pageHeight = doc.internal.pageSize.getHeight();
  bodyLines.forEach((line) => {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = 56;
    }
    doc.text(line, margin, y);
    y += 15;
  });

  y += 30;
  if (y > pageHeight - 80) {
    doc.addPage();
    y = 56;
  }

  // --- Signature block ---
  doc.text('For ' + (company?.name || 'Company Name'), margin, y);
  y += 50;
  doc.text(letterhead.prepared_by || 'Authorized Signatory', margin, y);

  return doc;
}

export function downloadLetterheadPdf(letterhead, company) {
  const doc = generateLetterheadPdf(letterhead, company);
  doc.save(`${letterhead.doc_number}.pdf`);
}

export function previewLetterheadPdf(letterhead, company) {
  const doc = generateLetterheadPdf(letterhead, company);
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
