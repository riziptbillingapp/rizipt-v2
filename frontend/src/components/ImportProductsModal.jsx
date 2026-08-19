import { useState } from "react";
import Papa from "papaparse";
import Modal from "./Modal.jsx";
import { api } from "../api/client.js";

const EXPECTED_COLUMNS = ["name", "item_type", "sku", "hsn_sac", "description", "unit", "price", "tax_rate"];

const SAMPLE_CSV = `name,item_type,sku,hsn_sac,description,unit,price,tax_rate
Cotton T-Shirt,product,TSH-001,6109,Plain cotton t-shirt,pcs,499,5
Home Delivery,service,,9965,Local delivery within city,service,50,18
Consulting Hour,service,,9983,,hrs,1500,18
`;

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rizipt-products-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportProductsModal({ open, onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const reset = () => {
    setRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results) => {
        if (results.errors?.length) {
          setParseError(results.errors[0].message || "Could not parse this file as CSV.");
          return;
        }
        const unknownCols = (results.meta.fields || []).filter((f) => !EXPECTED_COLUMNS.includes(f));
        if (!results.meta.fields?.includes("name")) {
          setParseError('This file needs a "name" column at minimum.');
          return;
        }
        setRows(results.data);
        if (unknownCols.length) {
          setParseError(
            `Note: unrecognized column(s) will be ignored: ${unknownCols.join(", ")}`
          );
        }
      },
      error: (err) => setParseError(err.message || "Could not read this file."),
    });
  };

  const missingNameCount = rows.filter((r) => !String(r.name || "").trim()).length;
  const validCount = rows.length - missingNameCount;

  const runImport = async () => {
    setImporting(true);
    setError("");
    try {
      const res = await api.importProducts(rows);
      setResult(res);
      onImported();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import products / services from CSV" wide>
      {error && <div className="mb-3 rounded-md bg-ledger-red/10 px-3 py-2 text-sm text-ledger-red">{error}</div>}

      {!result && (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            Columns recognized: <span className="font-mono text-xs">name</span> (required),{" "}
            <span className="font-mono text-xs">item_type</span> (product or service),{" "}
            <span className="font-mono text-xs">sku</span>,{" "}
            <span className="font-mono text-xs">hsn_sac</span>,{" "}
            <span className="font-mono text-xs">description</span>,{" "}
            <span className="font-mono text-xs">unit</span>,{" "}
            <span className="font-mono text-xs">price</span>,{" "}
            <span className="font-mono text-xs">tax_rate</span>. A row with a{" "}
            <span className="font-mono text-xs">sku</span> that already exists in your catalog updates that
            item instead of creating a duplicate.
          </p>

          <div className="mb-4 flex items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelected} />
            </label>
            {fileName && <span className="text-sm text-ink-soft">{fileName}</span>}
            <button type="button" onClick={downloadSampleCsv} className="ml-auto text-xs font-medium text-ledger-navy hover:underline">
              Download sample CSV
            </button>
          </div>

          {parseError && (
            <div className="mb-3 rounded-md bg-ledger-amber/10 px-3 py-2 text-sm text-ledger-amber">{parseError}</div>
          )}

          {rows.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-4 text-sm">
                <span className="text-ink">
                  <strong>{rows.length}</strong> row{rows.length === 1 ? "" : "s"} parsed
                </span>
                {missingNameCount > 0 && (
                  <span className="text-ledger-red">
                    {missingNameCount} row{missingNameCount === 1 ? "" : "s"} missing a name will be skipped
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-paper-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-paper text-left uppercase tracking-wide text-ink-soft">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">HSN/SAC</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Tax %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, idx) => (
                      <tr key={idx} className={`border-t border-paper-line ${!r.name ? "bg-ledger-red/5" : ""}`}>
                        <td className="px-3 py-1.5">{r.name || <em className="text-ledger-red">missing</em>}</td>
                        <td className="px-3 py-1.5 text-ink-soft">{r.item_type || "product"}</td>
                        <td className="px-3 py-1.5 font-mono text-ink-soft">{r.sku || "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-ink-soft">{r.hsn_sac || "—"}</td>
                        <td className="px-3 py-1.5 text-ink-soft">{r.unit || "unit"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.price || 0}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.tax_rate || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <p className="border-t border-paper-line px-3 py-2 text-center text-xs text-ink-soft">
                    + {rows.length - 50} more row{rows.length - 50 === 1 ? "" : "s"} not shown
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={runImport} disabled={importing || validCount === 0}>
                  {importing ? "Importing…" : `Import ${validCount} item${validCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {result && (
        <div>
          <div className="rounded-md border border-ledger-green/30 bg-ledger-green/5 p-4">
            <p className="font-semibold text-ledger-green">Import complete</p>
            <p className="mt-1 text-sm text-ink">
              {result.created} new item{result.created === 1 ? "" : "s"} created, {result.updated} existing item
              {result.updated === 1 ? "" : "s"} updated
              {result.skipped > 0 ? `, ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped` : ""}.
            </p>
          </div>
          {result.errors?.length > 0 && (
            <div className="mt-3 max-h-32 overflow-auto rounded-md border border-paper-line p-3 text-xs text-ink-soft">
              {result.errors.map((e, i) => (
                <div key={i}>
                  Row {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn-primary" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
