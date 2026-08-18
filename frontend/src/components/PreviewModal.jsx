import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import Modal from "./Modal.jsx";
import DocumentPreview from "./DocumentPreview.jsx";
import { generateDocumentPdf } from "../utils/generateDocumentPdf.js";

export default function PreviewModal({ docType, doc, customer, open, onClose }) {
  const [company, setCompany] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef(null);

  useEffect(() => {
    if (open) api.getCompany().then(setCompany).catch((e) => setError(e.message));
  }, [open]);

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const pdf = await generateDocumentPdf({ docType, doc, company, customer });
      pdf.save(`${doc.doc_number}.pdf`);
    } catch (e) {
      setError("Could not generate PDF: " + e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!open || !doc) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Preview — ${doc.doc_number}`} wide>
      {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}
      <div className="mb-4 flex justify-end gap-2">
        <button className="btn-primary" onClick={download} disabled={downloading || !company}>
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto rounded-md border border-paper-line bg-paper p-4">
        {company ? (
          <DocumentPreview docType={docType} doc={doc} company={company} customer={customer} previewRef={previewRef} />
        ) : (
          <p className="text-center text-ink-soft">Loading…</p>
        )}
      </div>
    </Modal>
  );
}
