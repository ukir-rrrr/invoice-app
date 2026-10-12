import type { SQLiteDatabase } from 'expo-sqlite';
import { formatJapanCalendarDate, formatJapanDisplayDate } from '@/lib/domain/dates';
import type { BackupChipState } from './backups';

type JournalRow = {
  created_at: number;
  dest_label: string | null;
  ok: number;
};

async function hasUserBackupFolderAsync(db: SQLiteDatabase): Promise<boolean> {
  const ios = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_kv WHERE key = 'backup.ios_bookmark'",
  );
  const android = await db.getFirstAsync<{ value: string }>(
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

export async function getBackupChipStateAsync(
  db: SQLiteDatabase,
  nowMs = Date.now(),
): Promise<BackupChipState> {
  const folder = await hasUserBackupFolderAsync(db);
  const latest = await db.getFirstAsync<JournalRow>(
    `SELECT created_at, dest_label, ok FROM backup_journal ORDER BY created_at DESC LIMIT 1`,
  );

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
