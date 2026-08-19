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

const TABLE: Record<DocKind, string> = {
  quotation: "quotations",
  invoice: "invoices",
  bill: "bills",
};

/**
 * Atomically increments the counter and returns the number that was "claimed"
 * (the pre-increment value), all in one UPDATE ... RETURNING statement. This
 * closes the race window that a separate SELECT-then-UPDATE would leave open
 * — two near-simultaneous requests can no longer both read the same sequence
 * number before either write commits.
 */
async function claimNextSeq(db: D1Database, accountId: number, kind: DocKind): Promise<{ seq: number; prefix: string }> {
  const seqCol = SEQ_COLUMN[kind];
  const prefixCol = PREFIX_COLUMN[kind];

  const row = await db
    .prepare(
      `UPDATE company_profile
       SET ${seqCol} = ${seqCol} + 1
       WHERE account_id = ?
       RETURNING ${seqCol} - 1 AS seq, ${prefixCol} AS prefix`
    )
    .bind(accountId)
    .first<{ seq: number; prefix: string }>();

  if (row) return row;

  // No company_profile row exists yet for this account (shouldn't normally
  // happen — one is created at signup — but guard against it defensively).
  await db.prepare("INSERT OR IGNORE INTO company_profile (account_id) VALUES (?)").bind(accountId).run();
  const retry = await db
    .prepare(
      `UPDATE company_profile
       SET ${seqCol} = ${seqCol} + 1
       WHERE account_id = ?
       RETURNING ${seqCol} - 1 AS seq, ${prefixCol} AS prefix`
    )
    .bind(accountId)
    .first<{ seq: number; prefix: string }>();

  return retry ?? { seq: 1, prefix: kind.toUpperCase().slice(0, 3) };
}

/**
 * Generates the next document number (e.g. INV-0007), guaranteed unique for
 * this account even under concurrent requests. As a last-resort safety net —
 * in case a counter was ever left out of sync with actual stored documents —
 * it also checks for an existing collision and skips forward if one is found,
 * rather than letting the INSERT fail with a UNIQUE constraint error.
 */
export async function nextDocNumber(db: D1Database, accountId: number, kind: DocKind): Promise<string> {
  const table = TABLE[kind];

  for (let attempt = 0; attempt < 5; attempt++) {
    const { seq, prefix } = await claimNextSeq(db, accountId, kind);
    const docNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

    const collision = await db
      .prepare(`SELECT 1 FROM ${table} WHERE account_id = ? AND doc_number = ?`)
      .bind(accountId, docNumber)
      .first();

    if (!collision) return docNumber;
    // Extremely unlikely given the atomic claim above, but if a counter was
    // ever manually reset or drifted out of sync with existing rows, skip
    // forward instead of failing the whole request.
  }

  // Fall back to a timestamp-suffixed number if five sequential attempts
  // somehow all collided — guarantees the caller never hard-fails here.
  const { prefix } = await claimNextSeq(db, accountId, kind);
  return `${prefix}-${Date.now()}`;
}
