import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATION_001_CHECKSUM } from './migrations/registry';
import { MIGRATIONS, type MigrationOutcome, type MigrationSpec } from './migrate';

async function tableExistsAsync(db: SQLiteDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name=?",
    [name],
  );
  return (row?.cnt ?? 0) > 0;
}

async function hasUserTablesWithoutMigrationsAsync(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM sqlite_master
     WHERE type='table' AND name NOT IN ('sqlite_sequence')`,
  );
  const count = row?.cnt ?? 0;
  if (await tableExistsAsync(db, 'schema_migrations')) {
    return count > 1;
  }
  return count > 0;
}

async function maxAppliedVersionAsync(db: SQLiteDatabase): Promise<number | null> {
  if (!(await tableExistsAsync(db, 'schema_migrations'))) {
    return null;
  }
  const row = await db.getFirstAsync<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations',
  );
  return row?.v ?? null;
}

async function readUserVersionAsync(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function integrityOkAsync(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  return row?.integrity_check === 'ok';
}

async function seedIssuerIfNeededAsync(db: SQLiteDatabase, now: number): Promise<void> {
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM issuer_profile WHERE id = 1');
  if (!row) {
    await db.runAsync(
      `INSERT INTO issuer_profile (id, business_name, updated_at) VALUES (1, '', ?)`,
      [now],
    );
  }
}

function bodySql(sql: string): string {
  return sql.replace(/^PRAGMA\s+[^;]+;\s*/gim, '').trim();
}

async function applyMigrationAsync(db: SQLiteDatabase, spec: MigrationSpec): Promise<void> {
  const now = Date.now();
  const ddl = bodySql(spec.sql);
  await db.withTransactionAsync(async () => {
    await db.execAsync(ddl);
    await db.runAsync(
      `INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)`,
      [spec.version, spec.name, now, spec.checksum],
    );
    await db.execAsync(`PRAGMA user_version = ${spec.version}`);
  });
}

export async function runMigrationsAsync(
  db: SQLiteDatabase,
  specs: MigrationSpec[] = MIGRATIONS,
): Promise<MigrationOutcome> {
  for (const spec of specs) {
    if (spec.checksum.trim() !== spec.checksum) {
      return { ok: false, reason: 'checksum_mismatch' };
    }
  }

  const schemaMigrations = await tableExistsAsync(db, 'schema_migrations');
  const orphanUserTables = await hasUserTablesWithoutMigrationsAsync(db);
  const maxVer = schemaMigrations ? await maxAppliedVersionAsync(db) : null;
  const uv = await readUserVersionAsync(db);

  if (!schemaMigrations && !orphanUserTables) {
    const first = specs[0];
    if (!first || first.checksum !== MIGRATION_001_CHECKSUM.trim()) {
      return { ok: false, reason: 'checksum_mismatch' };
    }
    await applyMigrationAsync(db, first);
    await seedIssuerIfNeededAsync(db, Date.now());
    if (!(await integrityOkAsync(db))) {
      return { ok: false, reason: 'integrity_failed' };
    }
    return { ok: true, userVersion: first.version };
  }

  if (!schemaMigrations && orphanUserTables) {
    return { ok: false, reason: 'repair_required' };
  }

  if (maxVer === null || uv !== maxVer) {
    return { ok: false, reason: 'repair_required' };
  }

  const pending = specs.filter((m) => m.version > maxVer);
  for (const spec of pending) {
    if (spec.checksum !== MIGRATION_001_CHECKSUM.trim() && spec.version === 1) {
      return { ok: false, reason: 'checksum_mismatch' };
    }
    await applyMigrationAsync(db, spec);
    if (!(await integrityOkAsync(db))) {
      return { ok: false, reason: 'integrity_failed' };
    }
  }

  await seedIssuerIfNeededAsync(db, Date.now());
  return { ok: true, userVersion: await readUserVersionAsync(db) };
}
