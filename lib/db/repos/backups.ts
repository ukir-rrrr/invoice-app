import type { SQLiteDatabase } from 'expo-sqlite';
import { formatJapanCalendarDate, formatJapanDisplayDate } from '@/lib/domain/dates';

export type BackupChipState =
  | { kind: 'ok'; title: string; subtitle: string }
  | { kind: 'warning'; title: string; subtitle: string }
  | { kind: 'stale'; title: string; subtitle: string }
  | { kind: 'failed'; title: string; subtitle: string };

type JournalRow = {
  created_at: number;
  dest_label: string | null;
  ok: number;
};

function hasUserBackupFolder(db: SQLiteDatabase): boolean {
  const ios = db.getFirstSync<{ value: string }>(
    "SELECT value FROM app_kv WHERE key = 'backup.ios_bookmark'",
  );
  const android = db.getFirstSync<{ value: string }>(
    "SELECT value FROM app_kv WHERE key = 'backup.android_uri'",
  );
  return Boolean(ios?.value || android?.value);
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function latestJournal(db: SQLiteDatabase): JournalRow | null {
  return db.getFirstSync<JournalRow>(
    `SELECT created_at, dest_label, ok FROM backup_journal ORDER BY created_at DESC LIMIT 1`,
  );
}

export function getBackupChipState(db: SQLiteDatabase, nowMs = Date.now()): BackupChipState {
  const folder = hasUserBackupFolder(db);
  const latest = latestJournal(db);

  if (!folder) {
    return {
      kind: 'warning',
      title: '保存先が未設定',
      subtitle: 'この端末を消すと、アプリ内のコピーも消える',
    };
  }

  if (!latest || latest.ok !== 1) {
    return {
      kind: 'failed',
      title: 'バックアップに失敗しました',
      subtitle: '発行した書類はそのまま残っています',
    };
  }

  const ageMs = nowMs - latest.created_at;
  const day = 24 * 60 * 60 * 1000;
  const label = latest.dest_label ?? '保存先';
  const dateYmd = formatJapanCalendarDate(latest.created_at);
  const displayDate = formatJapanDisplayDate(dateYmd);

  if (ageMs <= day) {
    return {
      kind: 'ok',
      title: 'バックアップ済',
      subtitle: `${formatTime(latest.created_at)} · ${label}`,
    };
  }

  if (ageMs <= 7 * day) {
    return {
      kind: 'stale',
      title: '7日以内',
      subtitle: `${displayDate} ${formatTime(latest.created_at)} · ${label}`,
    };
  }

  return {
    kind: 'warning',
    title: '今日の退避はまだありません',
    subtitle: `最後の成功は ${displayDate}。無ければ「まだありません」`,
  };
}

export function recordBackupSuccess(
  db: SQLiteDatabase,
  input: { backupId: string; destLabel: string; dbSha256: string; schemaVersion: number },
): void {
  db.runSync(
    `INSERT INTO backup_journal (backup_id, kind, created_at, dest_label, db_sha256, schema_version, ok)
     VALUES (?, 'daily', ?, ?, ?, ?, 1)`,
    [input.backupId, Date.now(), input.destLabel, input.dbSha256, input.schemaVersion],
  );
}

export function setBackupFolderAndroid(db: SQLiteDatabase, uri: string): void {
  const now = Date.now();
  db.runSync(
    `INSERT INTO app_kv (key, value, updated_at) VALUES ('backup.android_uri', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [uri, now],
  );
}
