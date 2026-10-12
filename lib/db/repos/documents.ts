import type { SQLiteDatabase } from 'expo-sqlite';
import { calculateTotals } from '@/lib/domain/tax';
import { lineAmountYen } from '@/lib/domain/money';
import type { DocumentKind, DocumentStatus, TaxCategory } from '@/lib/domain/types';
import { getIssuerProfile } from './issuer';

export type DocumentLine = {
  id: number;
  documentId: number;
  position: number;
  itemId: number | null;
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceYen: number;
  taxCategory: TaxCategory;
  amountYen: number;
};

export type Document = {
  id: number;
  kind: DocumentKind;
  status: DocumentStatus;
  docNo: string | null;
  issueDate: string | null;
  dueDate: string | null;
  title: string;
  notes: string;
  clientId: number | null;
  subtotalYen: number;
  taxYen: number;
  totalYen: number;
  snapClientName: string;
  createdAt: number;
  updatedAt: number;
};

type DocRow = {
  id: number;
  kind: DocumentKind;
  status: DocumentStatus;
  doc_no: string | null;
  issue_date: string | null;
  due_date: string | null;
  title: string;
  notes: string;
  client_id: number | null;
  subtotal_yen: number;
  tax_yen: number;
  total_yen: number;
  snap_client_name: string;
  created_at: number;
  updated_at: number;
};

type LineRow = {
  id: number;
  document_id: number;
  position: number;
  item_id: number | null;
  description: string;
  quantity_milli: number;
  unit: string;
  unit_price_yen: number;
  tax_category: TaxCategory;
  amount_yen: number;
};

function mapDoc(row: DocRow): Document {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    docNo: row.doc_no,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    title: row.title,
    notes: row.notes,
    clientId: row.client_id,
    subtotalYen: row.subtotal_yen,
    taxYen: row.tax_yen,
    totalYen: row.total_yen,
    snapClientName: row.snap_client_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLine(row: LineRow): DocumentLine {
  return {
    id: row.id,
    documentId: row.document_id,
    position: row.position,
    itemId: row.item_id,
    description: row.description,
    quantityMilli: row.quantity_milli,
    unit: row.unit,
    unitPriceYen: row.unit_price_yen,
    taxCategory: row.tax_category,
    amountYen: row.amount_yen,
  };
}

export function createDraftDocument(db: SQLiteDatabase, kind: DocumentKind): Document {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO documents (kind, status, created_at, updated_at) VALUES (?, 'draft', ?, ?)`,
    [kind, now, now],
  );
  const row = db.getFirstSync<DocRow>('SELECT * FROM documents WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) {
    throw new Error('document insert failed');
  }
  return mapDoc(row);
}

export function listDraftDocuments(db: SQLiteDatabase, limit = 3): Document[] {
  const rows = db.getAllSync<DocRow>(
    `SELECT * FROM documents WHERE status = 'draft' ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(mapDoc);
}

export type RecentDocument = Document & { displayClient: string };

export function listRecentDocuments(db: SQLiteDatabase, limit = 3): RecentDocument[] {
  const rows = db.getAllSync<DocRow>(
    `SELECT * FROM documents
     WHERE status IN ('issued', 'draft')
     ORDER BY COALESCE(issue_date, '') DESC, updated_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => {
    const doc = mapDoc(row);
    const displayClient =
      doc.status === 'issued' ? doc.snapClientName : doc.snapClientName || '（宛先なし）';
    return { ...doc, displayClient };
  });
}

export function getLatestIssuedInvoice(db: SQLiteDatabase): Document | null {
  const row = db.getFirstSync<DocRow>(
    `SELECT * FROM documents
     WHERE kind = 'invoice' AND status = 'issued'
     ORDER BY issue_date DESC, id DESC LIMIT 1`,
  );
  return row ? mapDoc(row) : null;
}

export function getDocumentLines(db: SQLiteDatabase, documentId: number): DocumentLine[] {
  const rows = db.getAllSync<LineRow>(
    `SELECT * FROM document_lines WHERE document_id = ? ORDER BY position ASC`,
    [documentId],
  );
  return rows.map(mapLine);
}

export function assertDraftEditable(db: SQLiteDatabase, documentId: number): Document {
  const row = db.getFirstSync<DocRow>('SELECT * FROM documents WHERE id = ?', [documentId]);
  if (!row) {
    throw new Error('document not found');
  }
  if (row.status !== 'draft') {
    throw new Error('issued documents are immutable');
  }
  return mapDoc(row);
}

export function deleteDraftDocument(db: SQLiteDatabase, documentId: number): void {
  const doc = assertDraftEditable(db, documentId);
  db.execSync('BEGIN IMMEDIATE');
  try {
    db.runSync('DELETE FROM document_tax_totals WHERE document_id = ?', [doc.id]);
    db.runSync('DELETE FROM document_lines WHERE document_id = ?', [doc.id]);
    db.runSync('DELETE FROM documents WHERE id = ? AND status = ?', [doc.id, 'draft']);
    db.execSync('COMMIT');
  } catch (e) {
    db.execSync('ROLLBACK');
    throw e;
  }
}

export type LineInput = {
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceYen: number;
  taxCategory: TaxCategory;
  itemId?: number | null;
};

export function saveDraftWithLines(
  db: SQLiteDatabase,
  documentId: number,
  lines: LineInput[],
  meta?: { title?: string; notes?: string; clientId?: number | null },
): Document {
  assertDraftEditable(db, documentId);
  const totals = calculateTotals(
    lines.map((l) => ({
      unitPriceYen: l.unitPriceYen,
      quantityMilli: l.quantityMilli,
      taxCategory: l.taxCategory,
    })),
  );

  db.execSync('BEGIN IMMEDIATE');
  try {
    if (meta) {
      db.runSync(
        `UPDATE documents SET title = COALESCE(?, title), notes = COALESCE(?, notes),
          client_id = COALESCE(?, client_id), updated_at = ?
         WHERE id = ? AND status = 'draft'`,
        [
          meta.title ?? null,
          meta.notes ?? null,
          meta.clientId === undefined ? null : meta.clientId,
          Date.now(),
          documentId,
        ],
      );
    }

    db.runSync('DELETE FROM document_lines WHERE document_id = ?', [documentId]);
    db.runSync('DELETE FROM document_tax_totals WHERE document_id = ?', [documentId]);

    lines.forEach((line, index) => {
      const amountYen = lineAmountYen(line.unitPriceYen, line.quantityMilli);
      db.runSync(
        `INSERT INTO document_lines
          (document_id, position, item_id, description, quantity_milli, unit, unit_price_yen, tax_category, amount_yen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          index + 1,
          line.itemId ?? null,
          line.description,
          line.quantityMilli,
          line.unit,
          line.unitPriceYen,
          line.taxCategory,
          amountYen,
        ],
      );
    });

    for (const bucket of totals.buckets) {
      db.runSync(
        `INSERT INTO document_tax_totals (document_id, tax_category, base_yen, tax_yen)
         VALUES (?, ?, ?, ?)`,
        [documentId, bucket.taxCategory, bucket.baseYen, bucket.taxYen],
      );
    }

    db.runSync(
      `UPDATE documents SET subtotal_yen = ?, tax_yen = ?, total_yen = ?, updated_at = ?
       WHERE id = ? AND status = 'draft'`,
      [totals.subtotalYen, totals.taxYen, totals.totalYen, Date.now(), documentId],
    );

    db.execSync('COMMIT');
  } catch (e) {
    db.execSync('ROLLBACK');
    throw e;
  }

  const row = db.getFirstSync<DocRow>('SELECT * FROM documents WHERE id = ?', [documentId]);
  if (!row) {
    throw new Error('document missing after save');
  }
  return mapDoc(row);
}

/** 発行済みは本文・合計・明細を更新しない。pdf パスとハッシュのみ（null のとき） */
export function updateIssuedPdfPath(
  db: SQLiteDatabase,
  documentId: number,
  pdfRelpath: string,
  pdfSha256: string,
): void {
  const row = db.getFirstSync<{ status: string; pdf_relpath: string | null }>(
    'SELECT status, pdf_relpath FROM documents WHERE id = ?',
    [documentId],
  );
  if (!row || row.status !== 'issued') {
    throw new Error('only issued documents accept pdf path');
  }
  if (row.pdf_relpath !== null) {
    throw new Error('pdf path already set');
  }
  db.runSync(
    `UPDATE documents SET pdf_relpath = ?, pdf_sha256 = ?, updated_at = ?
     WHERE id = ? AND status = 'issued' AND pdf_relpath IS NULL`,
    [pdfRelpath, pdfSha256, Date.now(), documentId],
  );
}

export function issueDocumentSnapshot(
  db: SQLiteDatabase,
  documentId: number,
  issueDate: string,
  dueDate: string | null,
  docNo: string,
): void {
  const draft = assertDraftEditable(db, documentId);
  const issuer = getIssuerProfile(db);
  if (!issuer?.businessName) {
    throw new Error('issuer name required');
  }

  db.execSync('BEGIN IMMEDIATE');
  try {
    db.runSync(
      `UPDATE documents SET
        status = 'issued',
        doc_no = ?,
        issue_date = ?,
        due_date = ?,
        snap_issuer_name = ?,
        snap_issuer_address = ?,
        snap_issuer_phone = ?,
        snap_issuer_email = ?,
        snap_issuer_reg_no = ?,
        snap_issuer_bank = ?,
        layout_stage = 'comfortable',
        layout_model_version = 1,
        font_subset_version = 1,
        issued_at = ?,
        updated_at = ?
       WHERE id = ? AND status = 'draft'`,
      [
        docNo,
        issueDate,
        dueDate,
        issuer.businessName,
        issuer.address,
        issuer.phone,
        issuer.email,
        issuer.invoiceRegNo,
        issuer.bankInfo,
        Date.now(),
        Date.now(),
        documentId,
      ],
    );
    db.execSync('COMMIT');
  } catch (e) {
    db.execSync('ROLLBACK');
    throw e;
  }

  const after = db.getFirstSync<DocRow>('SELECT * FROM documents WHERE id = ?', [documentId]);
  if (!after || after.status !== 'issued' || after.subtotal_yen !== draft.subtotalYen) {
    throw new Error('issue invariant failed');
  }
}

export function rejectIssuedMutation(
  db: SQLiteDatabase,
  documentId: number,
  patch: Record<string, unknown>,
): void {
  const row = db.getFirstSync<{ status: string }>('SELECT status FROM documents WHERE id = ?', [
    documentId,
  ]);
  if (row?.status === 'issued' || row?.status === 'voided') {
    const forbidden = Object.keys(patch).filter((k) => !['pdf_relpath', 'pdf_sha256'].includes(k));
    if (forbidden.length > 0) {
      throw new Error('issued documents are immutable');
    }
  }
}
