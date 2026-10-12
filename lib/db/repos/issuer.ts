import type { SQLiteDatabase } from 'expo-sqlite';

export type IssuerProfile = {
  id: 1;
  businessName: string;
  postalCode: string;
  address: string;
  phone: string;
  email: string;
  invoiceRegNo: string;
  bankInfo: string;
  defaultDueRule: 'next_month_end' | 'month_end' | 'plus_14' | 'none';
  updatedAt: number;
};

type Row = {
  id: number;
  business_name: string;
  postal_code: string;
  address: string;
  phone: string;
  email: string;
  invoice_reg_no: string;
  bank_info: string;
  default_due_rule: IssuerProfile['defaultDueRule'];
  updated_at: number;
};

function mapRow(row: Row): IssuerProfile {
  return {
    id: 1,
    businessName: row.business_name,
    postalCode: row.postal_code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    invoiceRegNo: row.invoice_reg_no,
    bankInfo: row.bank_info,
    defaultDueRule: row.default_due_rule,
    updatedAt: row.updated_at,
  };
}

export function getIssuerProfile(db: SQLiteDatabase): IssuerProfile | null {
  const row = db.getFirstSync<Row>('SELECT * FROM issuer_profile WHERE id = 1');
  return row ? mapRow(row) : null;
}

export function updateIssuerProfile(
  db: SQLiteDatabase,
  patch: Partial<Omit<IssuerProfile, 'id'>>,
): IssuerProfile {
  const current = getIssuerProfile(db);
  if (!current) {
    throw new Error('issuer_profile missing');
  }
  const next = {
    businessName: patch.businessName ?? current.businessName,
    postalCode: patch.postalCode ?? current.postalCode,
    address: patch.address ?? current.address,
    phone: patch.phone ?? current.phone,
    email: patch.email ?? current.email,
    invoiceRegNo: patch.invoiceRegNo ?? current.invoiceRegNo,
    bankInfo: patch.bankInfo ?? current.bankInfo,
    defaultDueRule: patch.defaultDueRule ?? current.defaultDueRule,
    updatedAt: Date.now(),
  };
  db.runSync(
    `UPDATE issuer_profile SET
      business_name = ?, postal_code = ?, address = ?, phone = ?, email = ?,
      invoice_reg_no = ?, bank_info = ?, default_due_rule = ?, updated_at = ?
     WHERE id = 1`,
    [
      next.businessName,
      next.postalCode,
      next.address,
      next.phone,
      next.email,
      next.invoiceRegNo,
      next.bankInfo,
      next.defaultDueRule,
      next.updatedAt,
    ],
  );
  return { id: 1, ...next };
}
