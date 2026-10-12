PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = FULL;

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  INTEGER NOT NULL,
  checksum    TEXT    NOT NULL
);

CREATE TABLE issuer_profile (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  business_name    TEXT    NOT NULL DEFAULT '',
  postal_code      TEXT    NOT NULL DEFAULT '',
  address          TEXT    NOT NULL DEFAULT '',
  phone            TEXT    NOT NULL DEFAULT '',
  email            TEXT    NOT NULL DEFAULT '',
  invoice_reg_no   TEXT    NOT NULL DEFAULT '',
  bank_info        TEXT    NOT NULL DEFAULT '',
  default_due_rule TEXT    NOT NULL DEFAULT 'next_month_end'
                     CHECK (default_due_rule IN ('next_month_end','month_end','plus_14','none')),
  updated_at       INTEGER NOT NULL
);

CREATE TABLE clients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  honorific    TEXT    NOT NULL DEFAULT '御中' CHECK (honorific IN ('御中','様')),
  postal_code  TEXT    NOT NULL DEFAULT '',
  address      TEXT    NOT NULL DEFAULT '',
  note         TEXT    NOT NULL DEFAULT '',
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_clients_alive ON clients(deleted_at, last_used_at DESC, name);

CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  unit            TEXT    NOT NULL DEFAULT '式',
  unit_price_yen  INTEGER NOT NULL CHECK (unit_price_yen BETWEEN -100000000 AND 100000000),
  tax_category    TEXT    NOT NULL
                    CHECK (tax_category IN ('standard_10','reduced_8','non_taxable')),
  last_used_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_items_alive ON items(deleted_at, last_used_at DESC, name);

CREATE TABLE number_sequences (
  kind       TEXT    NOT NULL CHECK (kind IN ('invoice','quote')),
  year       INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (kind, year)
);

CREATE TABLE documents (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                    TEXT    NOT NULL CHECK (kind IN ('invoice','quote')),
  status                  TEXT    NOT NULL CHECK (status IN ('draft','issued','voided')),
  doc_no                  TEXT,
  issue_date              TEXT,
  due_date                TEXT,
  title                   TEXT    NOT NULL DEFAULT '',
  notes                   TEXT    NOT NULL DEFAULT '',
  client_id               INTEGER REFERENCES clients(id),
  source_document_id      INTEGER REFERENCES documents(id),
  snap_client_name        TEXT    NOT NULL DEFAULT '',
  snap_client_honorific   TEXT    NOT NULL DEFAULT '御中',
  snap_client_address     TEXT    NOT NULL DEFAULT '',
  snap_issuer_name        TEXT    NOT NULL DEFAULT '',
  snap_issuer_address     TEXT    NOT NULL DEFAULT '',
  snap_issuer_phone       TEXT    NOT NULL DEFAULT '',
  snap_issuer_email       TEXT    NOT NULL DEFAULT '',
  snap_issuer_reg_no      TEXT    NOT NULL DEFAULT '',
  snap_issuer_bank        TEXT    NOT NULL DEFAULT '',
  rounding_mode           TEXT    NOT NULL DEFAULT 'floor' CHECK (rounding_mode = 'floor'),
  subtotal_yen            INTEGER NOT NULL DEFAULT 0,
  tax_yen                 INTEGER NOT NULL DEFAULT 0,
  total_yen               INTEGER NOT NULL DEFAULT 0,
  layout_stage            TEXT    CHECK (
                            layout_stage IS NULL OR layout_stage IN
                            ('comfortable','compact','dense','emergency')
                          ),
  layout_model_version    INTEGER,
  font_subset_version     INTEGER,
  pdf_relpath             TEXT,
  pdf_sha256              TEXT,
  issued_at               INTEGER,
  voided_at               INTEGER,
  void_reason             TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  UNIQUE (kind, doc_no),
  CHECK (
    (status = 'draft' AND doc_no IS NULL AND issued_at IS NULL)
    OR (
      status IN ('issued','voided')
      AND doc_no IS NOT NULL
      AND issue_date IS NOT NULL
      AND layout_stage IS NOT NULL
      AND layout_model_version >= 1
      AND font_subset_version IS NOT NULL
      AND issued_at IS NOT NULL
    )
  ),
  CHECK (status <> 'voided' OR (void_reason IS NOT NULL AND length(void_reason) > 0)),
  CHECK (issue_date IS NULL OR issue_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE INDEX idx_documents_list ON documents(status, issue_date DESC, id DESC);
CREATE INDEX idx_documents_client ON documents(client_id);

CREATE TABLE document_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  position        INTEGER NOT NULL,
  item_id         INTEGER REFERENCES items(id),
  description     TEXT    NOT NULL,
  quantity_milli  INTEGER NOT NULL CHECK (quantity_milli > 0 AND quantity_milli <= 1000000000),
  unit            TEXT    NOT NULL DEFAULT '',
  unit_price_yen  INTEGER NOT NULL CHECK (unit_price_yen BETWEEN -100000000 AND 100000000),
  tax_category    TEXT    NOT NULL
                    CHECK (tax_category IN ('standard_10','reduced_8','non_taxable')),
  amount_yen      INTEGER NOT NULL,
  UNIQUE (document_id, position)
);

CREATE TABLE document_tax_totals (
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  tax_category  TEXT    NOT NULL
                  CHECK (tax_category IN ('standard_10','reduced_8','non_taxable')),
  base_yen      INTEGER NOT NULL,
  tax_yen       INTEGER NOT NULL,
  PRIMARY KEY (document_id, tax_category)
);

CREATE TABLE backup_journal (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_id       TEXT    NOT NULL UNIQUE,
  kind            TEXT    NOT NULL
                    CHECK (kind IN ('daily','pre_migrate','pre_restore','manual','lkg')),
  created_at      INTEGER NOT NULL,
  dest_label      TEXT,
  db_sha256       TEXT    NOT NULL,
  schema_version  INTEGER NOT NULL,
  ok              INTEGER NOT NULL CHECK (ok IN (0,1)),
  error           TEXT
);
CREATE INDEX idx_backup_journal_time ON backup_journal(created_at DESC);

CREATE TABLE audit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  action     TEXT    NOT NULL CHECK (action IN ('issue','void','restore','migrate','backup_fail')),
  entity     TEXT    NOT NULL,
  entity_id  INTEGER,
  detail     TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE app_kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
