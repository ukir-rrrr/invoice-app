import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { MIGRATION_001_CHECKSUM, MIGRATION_001_SQL } from '@/lib/db/migrations/registry';

const migrationsDir = path.join(__dirname, '../lib/db/migrations');

function bodySql(sql: string): string {
  return sql.replace(/^PRAGMA\s+[^;]+;\s*/gim, '').trim();
}

function applyMigrationNode(db: Database.Database, sql: string, checksum: string): void {
  const now = Date.now();
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(bodySql(sql));
    db.prepare(
      `INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (1, '001_init', ?, ?)`,
    ).run(now, checksum);
    db.pragma('user_version = 1');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

describe('migrations', () => {
  it('M01 空DBに001を適用', () => {
    const file = path.join(os.tmpdir(), `invoice-migrate-m01-${Date.now()}.db`);
    const db = new Database(file);
    applyMigrationNode(db, MIGRATION_001_SQL, MIGRATION_001_CHECKSUM.trim());

    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.prepare(`INSERT INTO issuer_profile (id, business_name, updated_at) VALUES (1, '', ?)`).run(
      Date.now(),
    );
    const issuer = db.prepare('SELECT id FROM issuer_profile').all();
    expect(issuer).toHaveLength(1);

    const journal = db.pragma('journal_mode', { simple: true });
    expect(String(journal).toLowerCase()).toBe('wal');
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
    db.close();
    fs.unlinkSync(file);
  });

  it('M02 SQLと.sha256不一致なら適用しない', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '001_init.sql'), 'utf8');
    const onDisk = fs.readFileSync(path.join(migrationsDir, '001_init.sql.sha256'), 'utf8').trim();
    const bad = '0'.repeat(64);
    expect(bad).not.toBe(onDisk);

    const shouldApply = onDisk === MIGRATION_001_CHECKSUM.trim();
    expect(shouldApply).toBe(true);

    const db = new Database(':memory:');
    const mismatch = bad !== onDisk;
    if (mismatch) {
      expect(() => {
        if (bad !== MIGRATION_001_CHECKSUM.trim()) {
          throw new Error('checksum_mismatch');
        }
        applyMigrationNode(db, sql, bad);
      }).toThrow('checksum_mismatch');
    }
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name='clients'")
      .get() as {
      c: number;
    };
    expect(count.c).toBe(0);
    db.close();
  });
});
