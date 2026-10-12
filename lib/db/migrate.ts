import type { SQLiteDatabase } from 'expo-sqlite';
import {
  MIGRATION_001_CHECKSUM,
  MIGRATION_001_NAME,
  MIGRATION_001_SQL,
  MIGRATION_001_VERSION,
} from './migrations/registry';

export type MigrationOutcome =
  | { ok: true; userVersion: number }
  | { ok: false; reason: 'checksum_mismatch' | 'repair_required' | 'integrity_failed' };

export type MigrationSpec = {
  version: number;
  name: string;
  sql: string;
  checksum: string;
};

export const MIGRATIONS: MigrationSpec[] = [
  {
    version: MIGRATION_001_VERSION,
    name: MIGRATION_001_NAME,
    sql: MIGRATION_001_SQL,
    checksum: MIGRATION_001_CHECKSUM.trim(),
  },
];

function tableExists(db: SQLiteDatabase, name: string): boolean {
  const row = db.getFirstSync<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name=?",
    [name],
  );
  return (row?.cnt ?? 0) > 0;
}

function hasUserTablesWithoutMigrations(db: SQLiteDatabase): boolean {
  const row = db.getFirstSync<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM sqlite_master
     WHERE type='table' AND name NOT IN ('sqlite_sequence')`,
  );
  const count = row?.cnt ?? 0;
  if (tableExists(db, 'schema_migrations')) {
    return count > 1;
  }
  return count > 0;
}

function maxAppliedVersion(db: SQLiteDatabase): number | null {
  if (!tableExists(db, 'schema_migrations')) {
    return null;
  }
  const row = db.getFirstSync<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations',
  );
  return row?.v ?? null;
}

function readUserVersion(db: SQLiteDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

function integrityOk(db: SQLiteDatabase): boolean {
  const row = db.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check');
  return row?.integrity_check === 'ok';
}

function seedIssuerIfNeeded(db: SQLiteDatabase, now: number): void {
  const row = db.getFirstSync<{ id: number }>('SELECT id FROM issuer_profile WHERE id = 1');
  if (!row) {
    db.runSync(`INSERT INTO issuer_profile (id, business_name, updated_at) VALUES (1, '', ?)`, [
      now,
    ]);
  }
}

function bodySql(sql: string): string {
  return sql.replace(/^PRAGMA\s+[^;]+;\s*/gim, '').trim();
}

function applyMigration(db: SQLiteDatabase, spec: MigrationSpec): void {
  const now = Date.now();
  const ddl = bodySql(spec.sql);
  db.execSync('BEGIN IMMEDIATE');
  try {
    db.execSync(ddl);
    db.runSync(
      `INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)`,
      [spec.version, spec.name, now, spec.checksum],
    );
    db.execSync(`PRAGMA user_version = ${spec.version}`);
    db.execSync('COMMIT');
  } catch (e) {
    db.execSync('ROLLBACK');
    throw e;
  }
}

export function runMigrations(
  db: SQLiteDatabase,
  specs: MigrationSpec[] = MIGRATIONS,
): MigrationOutcome {
  for (const spec of specs) {
    if (spec.checksum.trim() !== spec.checksum) {
      return { ok: false, reason: 'checksum_mismatch' };
    }
  }

  const schemaMigrations = tableExists(db, 'schema_migrations');
  const orphanUserTables = hasUserTablesWithoutMigrations(db);
  const maxVer = schemaMigrations ? maxAppliedVersion(db) : null;
  const uv = readUserVersion(db);

  if (!schemaMigrations && !orphanUserTables) {
    const first = specs[0];
    if (!first || first.checksum !== MIGRATION_001_CHECKSUM.trim()) {
      return { ok: false, reason: 'checksum_mismatch' };
    }
    applyMigration(db, first);
    seedIssuerIfNeeded(db, Date.now());
    if (!integrityOk(db)) {
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
    applyMigration(db, spec);
    if (!integrityOk(db)) {
      return { ok: false, reason: 'integrity_failed' };
    }
  }

  seedIssuerIfNeeded(db, Date.now());
  return { ok: true, userVersion: readUserVersion(db) };
}
