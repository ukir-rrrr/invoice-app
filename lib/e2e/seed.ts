import type { SQLiteDatabase } from 'expo-sqlite';
import { updateIssuerProfile } from '@/lib/db/repos/issuer';
import { insertClient } from '@/lib/db/repos/clients';
import {
  createDraftDocument,
  issueDocumentSnapshot,
  saveDraftWithLines,
} from '@/lib/db/repos/documents';
import { recordBackupSuccess, setBackupFolderAndroid } from '@/lib/db/repos/backups';

export type E2EScenario = 'empty' | 'normal' | 'backup-warning';

export function resetForE2E(db: SQLiteDatabase): void {
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
  db.execSync('PRAGMA foreign_keys = OFF');
  for (const t of tables) {
    db.execSync(`DELETE FROM ${t}`);
  }
  db.execSync('PRAGMA foreign_keys = ON');
  db.runSync(
    `UPDATE issuer_profile SET business_name = '', postal_code = '', address = '', phone = '',
     email = '', invoice_reg_no = '', bank_info = '', updated_at = ? WHERE id = 1`,
    [Date.now()],
  );
}

export function applyE2EScenario(db: SQLiteDatabase, scenario: E2EScenario): void {
  resetForE2E(db);
  if (scenario === 'empty') {
    updateIssuerProfile(db, { businessName: '青葉デザイン工房' });
    return;
  }

  updateIssuerProfile(db, {
    businessName: '青葉デザイン工房',
    invoiceRegNo: 'T1234567890123',
  });

  const client = insertClient(db, { name: '株式会社南商事', honorific: '御中' });
  db.runSync('UPDATE clients SET last_used_at = ? WHERE id = ?', [Date.now(), client.id]);

  const draft = createDraftDocument(db, 'invoice');
  saveDraftWithLines(
    db,
    draft.id,
    [
      {
        description: '情報設計',
        quantityMilli: 1000,
        unit: '式',
        unitPriceYen: 180000,
        taxCategory: 'standard_10',
      },
      {
        description: '画面デザイン',
        quantityMilli: 1000,
        unit: '式',
        unitPriceYen: 60000,
        taxCategory: 'standard_10',
      },
    ],
    { clientId: client.id, title: '南商事 サイトリニューアル' },
  );

  db.runSync(`UPDATE documents SET snap_client_name = ?, snap_client_honorific = ? WHERE id = ?`, [
    client.name,
    client.honorific,
    draft.id,
  ]);

  issueDocumentSnapshot(db, draft.id, '2026-10-01', '2026-10-31', 'INV-2026-0014');

  if (scenario === 'normal') {
    setBackupFolderAndroid(db, 'content://backup-folder');
    recordBackupSuccess(db, {
      backupId: 'e2e00000000000001',
      destLabel: 'この端末内 / 請求の退避',
      dbSha256: 'abc123',
      schemaVersion: 1,
    });
  }
}
