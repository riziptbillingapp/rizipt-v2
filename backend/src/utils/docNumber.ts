import type { D1Database } from "@cloudflare/workers-types";

type DocKind = "quotation" | "invoice" | "bill";

const SEQ_COLUMN: Record<DocKind, string> = {
  quotation: "next_quotation_seq",
  invoice: "next_invoice_seq",
  bill: "next_bill_seq",
};

const PREFIX_COLUMN: Record<DocKind, string> = {
  quotation: "quotation_prefix",
  invoice: "invoice_prefix",
  bill: "bill_prefix",
};

/**
 * Generates the next document number (e.g. INV-0007) and advances the
 * counter on company_profile in the same call. Not perfectly race-proof
 * under concurrent writers, but D1's single-writer model makes collisions
 * very unlikely in practice for this app's usage pattern.
 */
export async function nextDocNumber(db: D1Database, kind: DocKind): Promise<string> {
  const seqCol = SEQ_COLUMN[kind];
  const prefixCol = PREFIX_COLUMN[kind];

  const row = await db
    .prepare(`SELECT ${seqCol} as seq, ${prefixCol} as prefix FROM company_profile WHERE id = 1`)
    .first<{ seq: number; prefix: string }>();

  const seq = row?.seq ?? 1;
  const prefix = row?.prefix || kind.toUpperCase().slice(0, 3);

  await db
    .prepare(`UPDATE company_profile SET ${seqCol} = ? WHERE id = 1`)
    .bind(seq + 1)
    .run();

  const padded = String(seq).padStart(4, "0");
  return `${prefix}-${padded}`;
}
