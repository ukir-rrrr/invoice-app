import type { SQLiteDatabase } from 'expo-sqlite';

export type Client = {
  id: number;
  name: string;
  honorific: '御中' | '様';
  postalCode: string;
  address: string;
  note: string;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type Row = {
  id: number;
  name: string;
  honorific: '御中' | '様';
  postal_code: string;
  address: string;
  note: string;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
};

function mapRow(row: Row): Client {
  return {
    id: row.id,
    name: row.name,
    honorific: row.honorific,
    postalCode: row.postal_code,
    address: row.address,
    note: row.note,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listRecentClients(db: SQLiteDatabase, limit = 5): Client[] {
  const rows = db.getAllSync<Row>(
    `SELECT * FROM clients
     WHERE deleted_at IS NULL
     ORDER BY last_used_at DESC NULLS LAST, name ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapRow);
}

export function insertClient(
  db: SQLiteDatabase,
  input: Pick<Client, 'name' | 'honorific'> &
    Partial<Pick<Client, 'postalCode' | 'address' | 'note'>>,
): Client {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO clients (name, honorific, postal_code, address, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.honorific,
      input.postalCode ?? '',
      input.address ?? '',
      input.note ?? '',
      now,
      now,
    ],
  );
  const id = result.lastInsertRowId;
  const row = db.getFirstSync<Row>('SELECT * FROM clients WHERE id = ?', [id]);
  if (!row) {
    throw new Error('client insert failed');
  }
  return mapRow(row);
}
