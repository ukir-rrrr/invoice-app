import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'app.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function applyConnectionPragmas(db: SQLite.SQLiteDatabase): void {
  if (Platform.OS === 'web') {
    return;
  }
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync('PRAGMA busy_timeout = 5000;');
  db.execSync('PRAGMA synchronous = FULL;');
}

export async function applyConnectionPragmasAsync(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA busy_timeout = 5000;');
  await db.execAsync('PRAGMA synchronous = FULL;');
}

export function openDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DB_NAME);
    applyConnectionPragmas(dbInstance);
  }
  return dbInstance;
}

export async function openDatabaseAsync(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    await applyConnectionPragmasAsync(dbInstance);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.closeSync();
    dbInstance = null;
  }
}

export async function closeDatabaseAsync(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}

export function resetDatabaseSingleton(): void {
  dbInstance = null;
}
