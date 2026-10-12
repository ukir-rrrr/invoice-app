import type { SQLiteDatabase } from 'expo-sqlite';
import type { E2EScenario } from './seed';

async function resetForE2EAsync(db: SQLiteDatabase): Promise<void> {
  const tables = [
    'document_tax_totals',
    'document_lines',
    'documents',
    'items',
    'clients',
    'number_sequences',
    'backup_journal',
    'audit_events',
    'app_kv',
  ];
  await db.execAsync('PRAGMA foreign_keys = OFF');
  for (const t of tables) {
    await db.execAsync(`DELETE FROM ${t}`);
  }
  await db.execAsync('PRAGMA foreign_keys = ON');
}

export async function applyE2EScenarioAsync(
  db: SQLiteDatabase,
  scenario: E2EScenario,
): Promise<void> {
  await resetForE2EAsync(db);
  const now = Date.now();

  await db.runAsync(
    `UPDATE issuer_profile SET business_name = ?, invoice_reg_no = ?, updated_at = ? WHERE id = 1`,
    ['青葉デザイン工房', scenario === 'empty' ? '' : 'T1234567890123', now],
  );

  if (scenario === 'empty') {
    return;
  }

  const clientResult = await db.runAsync(
    `INSERT INTO clients (name, honorific, postal_code, address, note, last_used_at, created_at, updated_at)
     VALUES (?, '御中', '', '', '', ?, ?, ?)`,
    ['株式会社南商事', now, now, now],
  );
  const clientId = clientResult.lastInsertRowId;

  const docResult = await db.runAsync(
    `INSERT INTO documents (
      kind, status, doc_no, issue_date, due_date, title, client_id,
      snap_client_name, snap_client_honorific,
      snap_issuer_name, subtotal_yen, tax_yen, total_yen,
      layout_stage, layout_model_version, font_subset_version, issued_at,
      created_at, updated_at
    ) VALUES (
      'invoice', 'issued', 'INV-2026-0014', '2026-10-01', '2026-10-31',
      '南商事 サイトリニューアル', ?, '株式会社南商事', '御中',
      '青葉デザイン工房', 240000, 24000, 264000,
      'comfortable', 1, 1, ?, ?, ?
    )`,
    [clientId, now, now, now],
  );

  await db.runAsync(
    `INSERT INTO document_lines
      (document_id, position, description, quantity_milli, unit, unit_price_yen, tax_category, amount_yen)
     VALUES (?, 1, '情報設計', 1000, '式', 180000, 'standard_10', 180000),
            (?, 2, '画面デザイン', 1000, '式', 60000, 'standard_10', 60000)`,
    [docResult.lastInsertRowId, docResult.lastInsertRowId],
  );

  if (scenario === 'normal') {
    await db.runAsync(
      `INSERT INTO app_kv (key, value, updated_at) VALUES ('backup.android_uri', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['content://backup-folder', now],
    );
    await db.runAsync(
      `INSERT INTO backup_journal (backup_id, kind, created_at, dest_label, db_sha256, schema_version, ok)
       VALUES ('e2e00000000000001', 'daily', ?, 'この端末内 / 請求の退避', 'abc123', 1, 1)`,
      [now],
    );
  }
}
