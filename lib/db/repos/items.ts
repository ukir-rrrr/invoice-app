import type { SQLiteDatabase } from 'expo-sqlite';
import type { TaxCategory } from '@/lib/domain/types';

export type Item = {
  id: number;
  name: string;
  unit: string;
  unitPriceYen: number;
  taxCategory: TaxCategory;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type Row = {
  id: number;
  name: string;
  unit: string;
  unit_price_yen: number;
  tax_category: TaxCategory;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
};

function mapRow(row: Row): Item {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    unitPriceYen: row.unit_price_yen,
    taxCategory: row.tax_category,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listItems(db: SQLiteDatabase, limit = 100): Item[] {
  const rows = db.getAllSync<Row>(
    `SELECT * FROM items WHERE deleted_at IS NULL ORDER BY name LIMIT ?`,
    [limit],
  );
  return rows.map(mapRow);
}

export function insertItem(
  db: SQLiteDatabase,
  input: Pick<Item, 'name' | 'unit' | 'unitPriceYen' | 'taxCategory'>,
): Item {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO items (name, unit, unit_price_yen, tax_category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.name, input.unit, input.unitPriceYen, input.taxCategory, now, now],
  );
  const row = db.getFirstSync<Row>('SELECT * FROM items WHERE id = ?', [result.lastInsertRowId]);
  if (!row) {
    throw new Error('item insert failed');
  }
  return mapRow(row);
}
