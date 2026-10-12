# オフライン請求書アプリ 設計書

**観点:** データ保護（Data Protection）  
**対象:** Expo (React Native / TypeScript / expo-router) の iOS / Android 請求書・見積書アプリ  
**版:** v1.0（設計のみ。実装コードは含まない）  
**価格想定:** 買い切り 980〜1,500円  
**前提:** サーバなし。全データは端末内。売りの中核は「消えない・戻せる」。

---

## 0. この文書の立場

競合の最悪クレームは次の3つである。

1. ある朝、請求書が全部消えている。
2. iCloud バックアップから戻せない、戻したら壊れている。
3. PDF が A4 2枚目に溢れ、取引先に出せない。

本設計は **1 と 2 を「起きないもの」に近づける** ことを最優先にする。3 は発行済み PDF と発行スナップショットの保全まで含めて扱う。

簡潔さ・入力手数・法的厳密さの最大化は、データが残っていて初めて意味がある。データが消えた瞬間、税計算の正しさも UX も無価値になる。よって本設計は次を教義とする。

> **唯一のコピーを上書きしてはならない。壊れたコピーで健全なコピーを置換してはならない。マイグレーションはバックアップ成功後にしか走らせない。発行済み書類は不変である。**

---

## 1. 設計原則

### 1.1 絶対原則

| # | 原則 | 具体的帰結 |
|---|---|---|
| P1 | 3 コピー常時 | 稼働 DB、アプリ内 Last-Known-Good（LKG）、ユーザ可視ストレージのローテーション。どれか1つが死んでも復元できる。 |
| P2 | 原子書き込み | 一時ファイルへ書いて検証し、最後に rename。成功するまで旧ファイルは残す。 |
| P3 | 検証してから置換 | チェックサム・`integrity_check`・スキーマ版・行数・外部キーが通るまで live DB に触れない。 |
| P4 | 発行は凍結 | 発行済み請求書・見積書の金額・税・発行者・明細は更新しない。直すなら赤伝・再発行（新文書）。 |
| P5 | ソフトデリート | 物理 DELETE はバックアップローテ以外禁止。墓石と監査ログを残す。 |
| P6 | マイグレーションは可逆前提 | 破壊的 DDL は v1 で禁止。適用前に必ずスナップショット。失敗時は自動ロールバック。 |
| P7 | 金額は整数円 | IEEE754 を金額経路に一切入れない。税計算も整数演算。 |
| P8 | OS バックアップを信用しない | iCloud / Google 自動バックアップは「おまけ」であり、復元経路にしない。 |

### 1.2 非目標（v1 でやらない）

- クラウド同期、アカウント、複数端末。
- 電子帳簿保存法のタイムスタンプ事業者連携、全書類の検索要件の完全準拠。
- 入金消込、在庫、帳票の複数テンプレート。
- 暗号化バックアップのパスフレーズ UX（端末のファイル保護に委ね、バックアップ自体は平文＋完全性）。
- 「消したデータを二度と戻せない」ハードデリート UI。

暗号化より完全性を優先する。紛失端末の機密漏洩より、フリーランスが確定申告前に請求台帳を失う事故の方が、本プロダクトの致命傷だからである。端末ロックと必要なら後続のオプション暗号化で足りる。

---

## 2. ライブラリ選定と理由

ピン留め対象は **Expo SDK 54 系**（執筆時点の安定系統）。新規 SDK へ上げるときは、必ず「空DB→v1マイグレーション→ゴールデン税ケース→バックアップ往復」を実機で通してから。

### 2.1 採用（必須）

| ライブラリ | 役割 | 採用理由（データ保護） |
|---|---|---|
| `expo-sqlite` | 唯一の正本 | WAL・トランザクション・`PRAGMA integrity_check`・`user_version` が使える。JSON ファイル正本は部分書き込みで死ぬ。 |
| `expo-file-system`（新 API / `Paths`） | バックアップ配置・原子 rename | iOS 共有コンテナ、Android アプリ外部ファイル、一時ファイル操作が必要。 |
| `expo-crypto` | SHA-256 | バックアップ封筒と DB バイト列の完全性。自前ハッシュ禁止。 |
| `expo-print` | HTML→PDF | オフラインで完結。生成 PDF は発行成果物としてファイル保存する。 |
| `expo-sharing` | PDF / バックアップ共有 | メール・Files への退避口。共有失敗はデータ損失ではない。 |
| `expo-document-picker` | リストア元選択 | ユーザが Files / ストレージ上のバックアップを明示選択する。サイレント上書きを防ぐ。 |
| `expo-intent-launcher`（Android） / `expo-linking` | バックアップフォルダを開く | 「バックアップがある場所」をユーザが目視できること自体が保護機能。 |
| `zod` | バックアップ封筒・設定・インポート検証 | 壊れた JSON を部分適用しない。パース失敗は拒否。 |
| `expo-router` | 画面 | ファイルベースで画面境界が明確。データ層を画面に混ぜない。 |
| `jest` + `ts-jest` | ゴールデンテスト | 税とレイアウト契約を実行可能仕様にする。 |

### 2.2 採用（薄い補助）

| ライブラリ | 役割 | 条件 |
|---|---|---|
| `date-fns-tz` | 表示用 JST | 保存は常に UTC 整数 epoch。TZ 変換は表示層のみ。 |
| `nanoid` | 文書公開 ID | DB 主キーは INTEGER。外部に出す ID は衝突耐性のある文字列。 |
| `fast-check`（開発） | 税計算のプロパティテスト | ゴールデンケースを補完。丸めの一回性を壊す実装を落とす。 |

### 2.3 明示的に使わない

| 候補 | 却下理由 |
|---|---|
| Drizzle / WatermelonDB / Realm | マイグレーションとトランザクション境界が隠蔽される。v1 は自前の逐次 SQL マイグレーションと明示 BEGIN が必要。ORM は「便利な喪失装置」になりやすい。 |
| AsyncStorage / MMKV を正本に | 型なし・スキーマなし・完全性検証なし。設定キャッシュにも使わない。 |
| `JSON.stringify` した巨大1ファイル | 書き込み中クラッシュでファイル全体が死ぬ。SQLite より弱い。 |
| iCloud Drive / Google Drive SDK 自動同期 | 競合の主戦場。コンフリクトと部分アップロードを制御できない。 |
| `expo-secure-store` に台帳を入れる | サイズ制限とバックアップ対象外。登録番号1個なら設定テーブルで足りる。 |
| `react-native-html-to-pdf` 等のサード PDF | メンテ断絶時に発行成果物パイプラインが死ぬ。Expo 公式に寄せる。 |
| サーバ / BaaS | プロダクト定義に反する。オフライン保証を弱める。 |

### 2.4 プラットフォーム権限

- **iOS:** バックアップ書き出し先はユーザが選んだフォルダ（Files の「この iPhone 内」を推奨）。`UIDocumentPicker` 相当でセキュリティスコープ付き URL を保持する。iCloud を選んだ場合は起動時とバックアップ成功画面で警告する。
- **Android:** Storage Access Framework でユーザ選択ディレクトリに `content://` 書き込み。共有ストレージ直書き（古い `WRITE_EXTERNAL_STORAGE`）は使わない。
- 権限拒否時は **発行も編集も止めない**。その代わりホームに「保護されていない」赤バナーを常時出し、日次バックアップはアプリ内 LKG のみに落とす。LKG だけではアンインストール耐性がないことを文言で明示する。

---

## 3. データ表現

### 3.1 お金

- 通貨は **JPY のみ**（v1）。
- すべての金額列は `INTEGER NOT NULL`（円）。負数は値引き行のみ許可。
- 税計算の中間値は **整数ミリ円**（円 × 1,000）で持つ。`number` の除算結果をそのまま `Math.round` しない。
- TypeScript 上の型:

```ts
type Yen = number & { readonly __yen: unique symbol };
type MilliYen = bigint & { readonly __milli: unique symbol };
```

実行時は zod で `Number.isInteger` と範囲（`-10_000_000_000`〜`10_000_000_000`）を強制する。`bigint` を SQL に出さず、永続化は常に円整数。

### 3.2 税率

```ts
type TaxRateCode = 'standard_10' | 'reduced_8' | 'exempt_0' | 'non_taxable';
```

- 標準 10%、軽減 8%、非課税、不課税。
- 税率は **コードで保存**し、百分率はマスタから引く。将来の税率改正で過去書類を再計算しないため。
- 発行時に `document_tax_totals` へ **計算結果をスナップショット**する。画面も PDF もこのスナップショットを読む。再計算はプレビューと下書きのみ。

### 3.3 端数処理

設定は発行者単位で1つ。適格請求書は「一の請求書につき税率ごとに1回」が法令上の制約であり、商品行ごとの丸めは禁止（国税庁 Q&A 問57、消令70の10）。

```ts
type RoundingMode = 'floor' | 'ceil' | 'half_up';
```

デフォルトは `floor`（切捨て）。変更しても **発行済み書類は変わらない**。

### 3.4 税表記

```ts
type PriceBasis = 'exclusive' | 'inclusive';
```

1枚の書類内で税抜行と税込行を混在させない。混在は端数の解釈を増やし、再計算不能なバックアップ差分を生む。マスタ品目は税抜単価を正とし、表示だけ切替える。

### 3.5 適格請求書発行事業者登録番号

- 保存形式: `T` + 数字13桁の文字列。正規表現 `/^T[0-9]{13}$/`。
- 空を許可（免税事業者・経過措置）。空のとき PDF に登録番号欄を出さない。
- チェックディジット検証は v1 では **警告のみ**。番号誤りで保存を拒否すると、ユーザが「後で直す」ために下書きを捨てる事故が起きる。ただし発行時は警告をモーダルで再確認する。

### 3.6 文書ライフサイクル

```
draft → issued → (voided)
quote(issued) → invoice(draft, source_id) → invoice(issued)
```

- `draft`: 可変。
- `issued`: 不変。PDF ファイルを生成し、パスと PDF の SHA-256 を行に保存する。
- `voided`: 無効。本体は残す。理由と時刻を記録。
- 見積→請求は **コピー**。見積を請求に「変身」させない。突合と監査のため `source_document_id` を残す。

### 3.7 発行者スナップショット

発行者（自社）の屋号・住所・登録番号・振込先を書類ヘッダにコピーする。プロフィールを後から変えても過去 PDF と DB 表示が食い違わない。PDF 再生成はスナップショットから行い、現行プロフィールを読まない。

### 3.8 時刻とロケール

- 保存: `INTEGER` epoch millis（UTC）。
- 書類上の日付: `issue_date` は **暦日** `YYYY-MM-DD` 文字列（日本の請求日）。TZ 変換で前日にずれないよう、ユーザが選んだ暦日をそのまま保存する。
- 表示ロケール: `ja-JP` 固定。

### 3.9 バックアップ封筒（論理型）

物理実体はディレクトリまたは zip 相当の単一ファイル `.invbak`。中身:

```
manifest.json    … 封筒メタ（zod 必須）
payload.sqlite   … WAL チェックポイント済みの一貫コピー
payload.sha256   … hex。payload バイト列の SHA-256
```

`manifest.json` の契約:

```ts
type BackupManifestV1 = {
  format: 'invoice-backup';
  formatVersion: 1;
  schemaVersion: number;       // PRAGMA user_version
  appVersion: string;          // semver
  createdAt: string;           // ISO-8601 UTC
  backupId: string;            // nanoid
  kind: 'daily' | 'pre_migrate' | 'pre_restore' | 'manual' | 'lkg';
  dbByteLength: number;
  dbSha256: string;            // payload.sha256 と一致必須
  rowCounts: {
    clients: number;
    items: number;
    documents: number;
    document_lines: number;
    document_tax_totals: number;
  };
  latestIssuedDocumentNo: string | null;
  issuerName: string | null;   // 人がファイルを識別するため
};
```

JSON を正本にしない。SQLite を正本にし、manifest は検証と人間可読の目次である。`rowCounts` 不一致はリストア拒否。

---

## 4. SQL スキーマとマイグレーション

### 4.1 接続 PRAGMA（起動時必須）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;          -- 金額台帳。NORMAL は採用しない
PRAGMA temp_store = MEMORY;
PRAGMA recursive_triggers = ON;
```

WAL を使う以上、バックアップ前に必ず `PRAGMA wal_checkpoint(FULL)` する。コピー対象は `app.db` だけでなく、万一チェックポイント失敗時は `-wal` / `-shm` もセットで扱う。復元・削除時にサイドカーを残すと、同名 DB 再作成時に古い WAL が再生され **健全な空DBが汚染される**（expo-sqlite にも同種の既知問題がある）。本アプリはサイドカーを第一級ファイルとして扱う。

### 4.2 v1 スキーマ（`user_version = 1`）

```sql
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  INTEGER NOT NULL,
  checksum    TEXT    NOT NULL,          -- 適用した SQL ファイルの SHA-256
  snapshot_backup_id TEXT                -- 適用直前スナップショット
);

CREATE TABLE issuer_profile (
  id                    INTEGER PRIMARY KEY CHECK (id = 1), -- 単一行
  business_name         TEXT    NOT NULL DEFAULT '',
  postal_code           TEXT    NOT NULL DEFAULT '',
  address               TEXT    NOT NULL DEFAULT '',
  phone                 TEXT    NOT NULL DEFAULT '',
  email                 TEXT    NOT NULL DEFAULT '',
  invoice_reg_no        TEXT    NOT NULL DEFAULT '', -- '' or T+13
  bank_info             TEXT    NOT NULL DEFAULT '',
  price_basis           TEXT    NOT NULL DEFAULT 'exclusive'
                          CHECK (price_basis IN ('exclusive', 'inclusive')),
  rounding_mode         TEXT    NOT NULL DEFAULT 'floor'
                          CHECK (rounding_mode IN ('floor', 'ceil', 'half_up')),
  default_due_days      INTEGER NOT NULL DEFAULT 30,
  invoice_seq           INTEGER NOT NULL DEFAULT 0,
  quote_seq             INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE clients (
  id           INTEGER PRIMARY KEY,
  public_id    TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  honorific    TEXT    NOT NULL DEFAULT '御中',
  postal_code  TEXT    NOT NULL DEFAULT '',
  address      TEXT    NOT NULL DEFAULT '',
  contact_name TEXT    NOT NULL DEFAULT '',
  email        TEXT    NOT NULL DEFAULT '',
  note         TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_clients_alive ON clients(deleted_at, name);

CREATE TABLE items (
  id            INTEGER PRIMARY KEY,
  public_id     TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  unit          TEXT    NOT NULL DEFAULT '',
  unit_price    INTEGER NOT NULL,           -- 税抜円
  tax_rate_code TEXT    NOT NULL
                  CHECK (tax_rate_code IN ('standard_10','reduced_8','exempt_0','non_taxable')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX idx_items_alive ON items(deleted_at, name);

CREATE TABLE documents (
  id                   INTEGER PRIMARY KEY,
  public_id            TEXT    NOT NULL UNIQUE,
  doc_type             TEXT    NOT NULL CHECK (doc_type IN ('invoice', 'quote')),
  status               TEXT    NOT NULL CHECK (status IN ('draft', 'issued', 'voided')),
  doc_no               TEXT    NOT NULL,          -- INV-2026-0001 / QUO-2026-0001
  issue_date           TEXT    NOT NULL,          -- YYYY-MM-DD
  due_date             TEXT,                      -- invoice のみ
  title                TEXT    NOT NULL DEFAULT '',
  notes                TEXT    NOT NULL DEFAULT '',
  client_id            INTEGER REFERENCES clients(id),
  source_document_id   INTEGER REFERENCES documents(id),
  -- 発行時スナップショット（draft は現行 client / issuer から埋める）
  snap_client_name     TEXT    NOT NULL DEFAULT '',
  snap_client_address  TEXT    NOT NULL DEFAULT '',
  snap_client_honorific TEXT   NOT NULL DEFAULT '御中',
  snap_issuer_name     TEXT    NOT NULL DEFAULT '',
  snap_issuer_address  TEXT    NOT NULL DEFAULT '',
  snap_issuer_reg_no   TEXT    NOT NULL DEFAULT '',
  snap_issuer_bank     TEXT    NOT NULL DEFAULT '',
  snap_price_basis     TEXT    NOT NULL DEFAULT 'exclusive',
  snap_rounding_mode   TEXT    NOT NULL DEFAULT 'floor',
  subtotal_ex_yen      INTEGER NOT NULL DEFAULT 0,
  tax_yen              INTEGER NOT NULL DEFAULT 0,
  total_yen            INTEGER NOT NULL DEFAULT 0,
  pdf_relpath          TEXT,
  pdf_sha256           TEXT,
  issued_at            INTEGER,
  voided_at            INTEGER,
  void_reason          TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  deleted_at           INTEGER,
  UNIQUE (doc_type, doc_no)
);
CREATE INDEX idx_documents_list ON documents(deleted_at, status, issue_date DESC);
CREATE INDEX idx_documents_client ON documents(client_id, deleted_at);

CREATE TABLE document_lines (
  id             INTEGER PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  position       INTEGER NOT NULL,
  item_id        INTEGER REFERENCES items(id),
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL,          -- 数量 × 1000（小数3桁まで）
  unit           TEXT    NOT NULL DEFAULT '',
  unit_price     INTEGER NOT NULL,          -- 税抜円
  tax_rate_code  TEXT    NOT NULL,
  line_ex_yen    INTEGER NOT NULL,          -- 数量×単価の行金額（税抜、丸めは行で切捨て）
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (document_id, position)
);

CREATE TABLE document_tax_totals (
  id              INTEGER PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  tax_rate_code   TEXT    NOT NULL,
  taxable_ex_yen  INTEGER NOT NULL,
  taxable_in_yen  INTEGER NOT NULL,
  tax_yen         INTEGER NOT NULL,
  UNIQUE (document_id, tax_rate_code)
);

CREATE TABLE backup_journal (
  id              INTEGER PRIMARY KEY,
  backup_id       TEXT    NOT NULL UNIQUE,
  kind            TEXT    NOT NULL,
  created_at      INTEGER NOT NULL,
  dest_uri        TEXT,                    -- ユーザ可視側。LKG は null 可
  lkg_relpath     TEXT,
  db_sha256       TEXT    NOT NULL,
  schema_version  INTEGER NOT NULL,
  ok              INTEGER NOT NULL,        -- 1=検証済み成功
  error           TEXT,
  rotated_out     INTEGER                  -- ローテで消した時刻
);

CREATE TABLE audit_events (
  id          INTEGER PRIMARY KEY,
  at          INTEGER NOT NULL,
  actor       TEXT    NOT NULL DEFAULT 'local',
  action      TEXT    NOT NULL,            -- issue, void, restore, migrate, delete_soft, backup
  entity      TEXT    NOT NULL,
  entity_id   INTEGER,
  payload     TEXT    NOT NULL DEFAULT '{}' -- 差分の要約。個人情報最小
);

CREATE TABLE app_kv (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- 例: backup.folder_uri, backup.last_ok_at, restore.last_rollback_id
```

`ON DELETE RESTRICT` を意図的に使う。発行済み明細を親ごと消す CASCADE はデータ保護に反する。

### 4.3 初期データ

起動時、`issuer_profile` が無ければ `id=1` を入れる。`schema_migrations` に version=1 を記録する。空アプリでもバックアップは「空の一貫状態」として成立しなければならない。

### 4.4 マイグレーション規約

ファイル: `src/db/migrations/00N_name.sql`。各ファイル先頭に `-- checksum: <sha256>` を置き、適用時に再ハッシュして照合する。改変済みマイグレーションを現場 DB に流す事故を防ぐ。

アルゴリズム `migrate()`:

1. DB を開き PRAGMA を適用。
2. `user_version` と `schema_migrations` の最大 version を比較。不一致なら **起動拒否**（「バックアップから戻す」画面のみ）。黙って直さない。
3. 適用すべき版が1つでもあれば、先に `kind='pre_migrate'` バックアップを LKG とユーザフォルダの両方に書く。
4. バックアップ検証失敗ならマイグレーション中止。アプリは旧スキーマのまま動かす。
5. `BEGIN IMMEDIATE;`
6. 対象 SQL を順適用。各版の後に `PRAGMA foreign_key_check;`。
7. `INSERT INTO schema_migrations ...;`
8. `PRAGMA user_version = N;` は **最後**。
9. `COMMIT;`
10. 起動直後に `PRAGMA integrity_check;` が `ok` 以外なら、手順 3 のスナップショットへ自動ロールバックし、ホームに「保護モード」を出す。

v1 で禁止する DDL:

- `DROP TABLE` / `DROP COLUMN`
- 既存 CHECK の狭小化
- NOT NULL 追加（DEFAULT なし）
- 発行済みスナップショット列の意味変更

追加列は `DEFAULT` 必須。新しい税率コードが必要なら **新しい CHECK を付けた新テーブル** にコピーする版を次の major schema とし、旧テーブルは残す。

### 4.5 文書番号

```
INV-{issue_year}-{seq:4}
QUO-{issue_year}-{seq:4}
```

`issuer_profile.invoice_seq` / `quote_seq` を `UPDATE ... SET invoice_seq = invoice_seq + 1` で原子採番する。欠番は許容。再利用は禁止。発行トランザクション内で採番し、失敗したらロールバックして番号を消費しない。

---

## 5. 主要アルゴリズム

### 5.1 消費税計算と端数処理

入力: 行配列、`PriceBasis`、`RoundingMode`。  
出力: 行の `line_ex_yen`、税率別合計、`tax_yen`、`total_yen`。  
**禁止:** 行ごとに消費税を出して合算すること。

数量は milli。行の税抜金額:

```
line_ex_yen = floor(unit_price_yen * quantity_milli / 1000)
```

値引きは負の `unit_price` または負の数量。行金額は整数円。

税率グループ `g` について:

```
taxable_ex_yen[g] = sum(line_ex_yen of g)
```

税額（税抜正本）:

```
raw_milli = taxable_ex_yen[g] * rate_numerator * 1000 / rate_denominator
  standard_10: 10 / 100
  reduced_8:    8 / 100
  exempt/non:   0 / 1
tax_yen[g] = round_mode(raw_milli / 1000)
```

実装は bigint:

```
raw = BigInt(taxable_ex_yen) * BigInt(num)   // 円×税率分子
// 分母は 100。余りを rounding_mode で処理
q = raw / 100n
r = raw % 100n
tax = applyRounding(q, r, 100n, mode)
```

`half_up` は「余り ≥ 分母/2 なら切り上げ」。負の値引きグループでは、切捨てが 0 方向か負無限方向かを仕様で固定する。**本アプリはすべて負無限方向（`floor`）と正無限方向（`ceil`）を数直線で定義する。** JS の `Math.floor` に合わせ、テストで `-1.1 → -2` を固定する。

税込正本（`inclusive`）のとき:

```
taxable_in_yen[g] = sum(inclusive line yen)
tax_yen[g] = round(taxable_in_yen[g] * rate / (100 + rate))
taxable_ex_yen[g] = taxable_in_yen[g] - tax_yen[g]
```

1枚の書類で basis を混在させないので、この分岐は書類定数で1回だけ。

書類合計:

```
tax_yen = sum(tax_yen[g])
total_yen = sum(taxable_ex_yen[g]) + tax_yen     // exclusive
total_yen = sum(taxable_in_yen[g])               // inclusive
```

発行時、この結果を `documents.*` と `document_tax_totals` に書き、以後再計算しない。プレビューは毎回計算するが、発行ボタンは「計算結果をトランザクションで凍結」する。

ゴールデンケース（必須、国税庁問57系）:

| ID | 条件 | 期待 |
|---|---|---|
| T01 | 税込 10% 60,000 / 8% 40,000、切捨て | 税 5,454 と 2,962、合計税 8,416 |
| T02 | 税込 8% 100円×3、切捨て | 税 22（行ごと7×3=21は不正） |
| T03 | 税抜 10% 1円×1、切捨て | 税 0、合計 1 |
| T04 | 税抜 10% 1円×1、切上げ | 税 1、合計 2 |
| T05 | 税抜 10% 15円、四捨五入 | 税 2 |
| T06 | 軽減のみ、税抜 108円、切捨て | 税 8 |
| T07 | 非課税行混在 | 非課税グループ税 0。他グループに混ぜない |
| T08 | 値引き -500（10%）、正行 10,000 | 課税標準 9,500 から税率1回 |
| T09 | 空行（数量0） | 課税標準に入れない |
| T10 | 見積を請求にコピー | 金額列がビット一致。ID と doc_no と type だけ違う |

### 5.2 1枚 A4 を保証する

目標: **発行された PDF は常に A4 portrait 1ページ。** 溢れた請求書は、無い方がマシである。2枚目に社印欄や振込先が落ちる事故は、データ破損に準ずる業務損害だから、生成物としても拒否する。

制約:

- 用紙: A4 (210×297mm)、余白上下 12mm・左右 14mm。
- 行数上限のハードキャップ: **20行**。21行目を UI が拒否する。これが第一の防御。
- 可変部: 明細フォント、行高、備考の行数。
- 固定部: タイトル、発行者、取引先、登録番号、税率別合計、振込先、頁フッター（「1 / 1」を必ず印字）。

アルゴリズム `fitToSingleA4(model)`:

1. HTML テンプレートを **ページ高さ計測モード** で描く。CSS は `page-break` 禁止、`html, body { height: auto }`。
2. 計測用に `expo-print` はページ分割後のページ数しか返さないため、**自前でレイアウト契約を数値化する**:
   - 固定ブロックの高さ（mm）を定数表にする。
   - 可変明細は `baseFontPt=10`, `lineMm=7.2` から開始。
   - `availableMm = 297 - margins - fixedBlocksMm(model)`。
   - `neededMm = rows * lineMm + notesMm`。
   - `neededMm <= availableMm` なら採用。
3. 足りなければ `fontPt` を 10 → 9 → 8 → 7 と下げ、行高を比例縮小。
4. それでもダメなら備考を 3行にクリップし、全文は DB に残す。PDF に「備考は省略。アプリ内で全文を表示」と出す。
5. それでもダメなら **発行しない**。エラー `LAYOUT_OVERFLOW`。ユーザは行数削減か備考短縮を求められる。黙って2ページ出さない。
6. 縮小後パラメータを `documents` には保存しない（再現は同一アルゴリズム＋スナップショットで足りる）。ただしテスト用に純関数として切り出す。

PDF 生成後の検証:

- `expo-print` の出力ファイルサイズ > 0。
- 可能ならページ数 API、または HTML に仕込んだ「page counter」が 1 であること。
- 生成バイトの SHA-256 を `documents.pdf_sha256` に保存。
- PDF は `documents/{public_id}.pdf` に原子書き込み。失敗した発行はトランザクションごと失敗。

HTML テンプレートは `src/pdf/invoice.a4.html.ts` の **1ファイルのみ**。条件分岐で2レイアウトに増やさない。レイアウト回帰の敵はテンプレート分岐である。

### 5.3 バックアップ / リストア（完全性と破損耐性）

#### 5.3.1 日次自動バックアップ

トリガ: アプリ起動時。`backup.last_ok_at` がローカル暦日（JST）で今日でなければ実行。バックグラウンドタスクは **信頼しない**（OS が殺す）。起動時実行を正とする。

加えて、次の直後にも LKG を更新する（ユーザ可視は日次のまま）:

- 文書発行成功
- リストア成功
- マイグレーション成功

手順 `exportBackup(kind)`:

1. `BEGIN IMMEDIATE` は取らず、代わりに `PRAGMA wal_checkpoint(FULL)`。失敗なら中止。
2. live DB ファイルを `tmp/{backupId}.sqlite` へ **バイトコピー**。
3. 一時接続で開き `PRAGMA integrity_check;` / `foreign_key_check;` / `user_version`。失敗なら tmp を捨てて中止。live は触らない。
4. SHA-256 を計算。`manifest.json` を組み立て zod で再パース。
5. 宛先ディレクトリに `*.invbak.tmp/` を作り、payload・sha256・manifest を書く。
6. 書いた payload を **再読込してハッシュ照合**（書いたつもり・読めるは別）。
7. `*.invbak.tmp` を `YYYY-MM-DD_HHmmss_{kind}_{backupId}.invbak` に rename。
8. 同じ中身をアプリ内 `lkg.invbak` にも同様の原子置換で置く。旧 LKG は `lkg.prev.invbak` にずらしてから置換する（LKG 自身のロールバック）。
9. `backup_journal` に `ok=1` を書く。
10. ローテーション:
    - daily: 30 日分
    - pre_migrate / pre_restore: 10 件
    - manual: 20 件
    - 削除は **新しいファイルの検証成功後** にだけ行う。
    - 削除対象は journal で `rotated_out` を立て、ファイル削除失敗は次回リトライ。

ユーザ可視側が無い（権限なし）場合、手順 7 をスキップし journal に `dest_uri=null, error='no_user_folder'` を残す。LKG は必ず更新する。

#### 5.3.2 ワンタップ・リストア

UI は「最新の検証済みバックアップを戻す」と「ファイルを選ぶ」の2つ。どちらも同じコア `restore(uri)` を使う。

手順（失敗したら **必ず元に戻す**）:

1. 選択ファイルをアプリ一時領域へコピー。
2. manifest を zod で検証。`formatVersion` が未来なら拒否（「新しいアプリで作られたバックアップ」）。
3. payload 再ハッシュ == `dbSha256` == `payload.sha256`。1ビットでも違えば拒否。
4. 一時パスで SQLite を開き `integrity_check` / `foreign_key_check` / 必須テーブル存在 / `rowCounts` 照合。
5. `schemaVersion > app.supportedMax` なら拒否。`< app` なら **リストア後に migrate()** するが、その前にこの payload 自体を `pre_restore` としてユーザフォルダへ複製する。
6. 現 live に対し `exportBackup('pre_restore')`。これが失敗したらリストア中止。
7. live 接続をすべて閉じる。
8. live を `app.db.swapped-out` に rename。payload を `app.db` に rename。サイドカー `-wal/-shm` は **削除**（旧 WAL 再生を防ぐ）。
9. 開き直し、PRAGMA、必要なら migrate、`integrity_check`。
10. どれかが失敗したら `app.db` を捨て、`app.db.swapped-out` を戻す。UI は「戻しませんでした。現データは無事です」。
11. 成功時のみ `swapped-out` を `pre_restore` 世代としてローテに組み込む。
12. `audit_events` に restore を書く。**リストア後の DB に対して**書く（旧監査を汚染しない）。旧監査はバックアップ側に残っている。

ワンタップは `backup_journal` の最新 `ok=1` かつファイルが現存し再検証できたものを選ぶ。再検証できない「最新」はスキップして1つ前を試す。壊れた最新に誘導しない。

#### 5.3.3 破損検知（起動時）

毎回:

1. live を開けなければ LKG からの自動復旧を提案（自動上書きはしない。確認ダイアログ必須）。
2. 開けても `integrity_check != ok` なら読み取り専用モード。書き込み API を閉じる。
3. ホームに「データが損傷しています。バックアップから戻してください」。

自動サイレント修復はしない。部分的に「直ったように見える」DB が最悪である。

#### 5.3.4 アンインストール耐性

アプリ削除で live と LKG は消える。よって初回起動ウィザードの完了条件は **ユーザ可視フォルダの設定成功**、または「リスクを理解した」チェックボックスである。後者を選んだ場合、ホームの赤バナーは消さない。

iOS の「この iPhone 内」は iCloud と異なり競合の失敗モードを踏まない。デフォルト案内文は「iCloud ではなく、この iPhone 内 / 本機のフォルダを選んでください」とする。

---

## 6. 画面フロー

```
(初回)
  Welcome
    → 発行者プロフィール（途中離脱可、下書き保存）
    → バックアップフォルダ設定（推奨完了条件）
    → Home

Home
  保護ステータス（最終バックアップ時刻 / 検証結果 / フォルダ有無）
  下書き・最近の発行
  [見積を作る] [請求を作る]
  タブ: 書類 / 取引先 / 品目 / 設定

書類一覧
  フィルタ: 種別・状態・期間
  行タップ → 書類詳細
  FAB → 種別選択 → 書類編集（draft）

書類編集（draft のみ可）
  取引先選択/新規
  明細追加（品目から / 手入力）
  税率・数量・単価
  税率別合計のライブ表示（スナップショットではない）
  [プレビュー] → PDF 相当 WebView
  [発行] → 確認（登録番号警告・レイアウト不能ならここで止める）
         → 発行トランザクション
         → 詳細（共有）

書類詳細（issued / voided）
  スナップショット表示（再計算しない）
  [PDFを共有]
  [見積から請求を作る]（quote かつ issued のみ）
  [無効にする]（理由必須、本体は残る）
  編集ボタンは出さない

取引先 / 品目
  一覧・検索・作成・編集
  削除はソフト。参照する下書きがあれば警告、発行済みがあれば削除可（墓石）

設定
  発行者
  税: 税抜/税込、端数
  バックアップ:
    フォルダ
    今すぐバックアップ
    バックアップ一覧（journal + 再検証バッジ）
    ワンタップ・リストア
    ファイルから戻す
  保護診断: integrity / 直近ハッシュ / フォルダ到達性

リストア確認
  「現在のデータを退避してから置き換えます」
  件数サマリ（取引先 n、書類 n）
  実行 → 進捗 → 成功 | 失敗（現データ保持を明記）
```

画面契約（データ保護）:

- 発行済み詳細は **SELECT スナップショット列だけ**。JOIN した現行マスタで上書き表示しない。
- リストア中はグローバル mutex。裏で発行できない。
- 削除確認は「非表示にします。バックアップには残ります」であり、「完全に消します」ではない。

---

## 7. モジュール構成

```
src/
  app/                         # expo-router 画面。I/O 直接禁止
    (tabs)/
    documents/[id].tsx
    documents/[id]/edit.tsx
    settings/backup.tsx
    restore.tsx
  db/
    open.ts                    # PRAGMA, 単一接続
    migrate.ts                 # 規約どおり
    migrations/001_init.sql
    repos/                     # トランザクション境界を持つ唯一の書込口
      issuerRepo.ts
      clientRepo.ts
      itemRepo.ts
      documentRepo.ts
      backupJournalRepo.ts
    integrity.ts               # integrity_check 包装
  domain/
    money.ts                   # Yen / MilliYen, 四則
    tax.ts                     # 純関数。I/O なし
    docNo.ts
    invoiceRegNo.ts
    layoutBudget.ts            # A4 フィット純関数
  backup/
    envelope.ts                # manifest zod
    exportBackup.ts
    restore.ts
    rotate.ts
    userFolder.ts              # SAF / iOS bookmark
    hash.ts
    atomicFs.ts                # write-temp-verify-rename
  pdf/
    invoice.a4.html.ts
    renderPdf.ts
  audit/
    log.ts
  testdata/
    tax.golden.json
    layout.golden.json
```

依存方向:

```
app → repos / backup / pdf
repos → db / domain / audit
backup → db / domain / atomicFs
pdf → domain
domain → （何にも依存しない）
```

画面が `expo-sqlite` を import したらレイヤ違反。CI で `eslint-plugin-import` の no-restricted-imports を課す。

書込 API はすべて `withImmediateTx(fn)`。ネスト禁止。発行は1トランザクションで:

1. 行ロック的に `issuer_profile` を読む
2. 採番
3. スナップショット列を埋める
4. 税計算結果を書く
5. PDF を temp に書く（FS は TX 外になり得るので **先に PDF を書き、ハッシュ確定後に TX**。PDF 失敗なら発行しない。TX 失敗なら PDF を捨てる）
6. audit

---

## 8. テスト戦略

### 8.1 単体（Jest, 純関数）

**税ゴールデン** `tax.golden.json`:

- §5.1 の T01–T10 を固定。
- 各ケースは `{ lines, basis, rounding, expect }`。`expect` は税率別配列と合計。
- 実装が1円でもずれたら失敗。スナップショットテストの自動更新は CI で禁止（`-u` を落とす）。

**レイアウトゴールデン** `layout.golden.json`:

- 行数 0, 1, 10, 20。
- 備考 0文字 / 200 / 800。
- 長い品名（全角40）、長い屋号。
- 期待: `{ fontPt, clippedNotes, ok }`。
- 20行＋長い備考は `ok=false` または備考クリップ。
- 21行は domain で例外。UI に届かせない。

**プロパティテスト:**

- 全行非負なら `total_yen >= 0`。
- 行ごとの税を丸めて足したものと、税率1回丸めは **一致しなくてよい**。一致を期待するテストは書かない（法令が禁止する計算法）。
- `restore(export(db))` の SHA-256 が一致（フィクスチャ DB）。

### 8.2 統合（Jest + 実ファイル、シミュレータ）

| ケース | 手順 | 期待 |
|---|---|---|
| B01 原子書き込みクラッシュ | tmp まで書いて rename 前に失敗注入 | 旧バックアップが残る |
| B02 壊した payload | 1バイト反転してリストア | 拒否。live 行数が不変 |
| B03 古い WAL 汚染 | 差し替え後に偽 `-wal` を置く | 起動が検知し読み取り専用 |
| B04 マイグレーション失敗 | 途中で SQL エラー | pre_migrate に自動復帰 |
| B05 スキーマ未来 | manifest.schemaVersion=+1 | 拒否文言 |
| B06 ワンタップが壊れた最新を飛ばす | journal 最新ファイルを欠く | 1つ前で成功 |
| B07 発行中バックアップ | mutex | バックアップは発行コミット後 |
| B08 見積→請求 | 金額列完全一致 | public_id と番号だけ異なる |
| B09 PDF ハッシュ | 同一スナップショットを2回描画 | ハッシュ一致（日付埋め込みなし） |
| B10 ソフトデリート | 取引先削除後リストアなしで非表示、SQL では残る | |

### 8.3 手動（実機、リリース前必須）

- iPhone: Files「この iPhone 内」へ日次相当を手動実行し、アプリ削除→再インストール→ファイルからリストア。
- iPhone: iCloud フォルダを選んだときの警告表示。
- Android: SAF フォルダ、再起動後の書き込み継続（永続パーミッション）。
- 発行→即機内電源断相当（開発メニューで kill）→起動後 integrity と LKG。

シミュレータだけの緑は出荷条件にしない。バックアップは OS ファイル権限の話だからである。

---

## 9. リスク

| リスク | 深刻度 | 対策 |
|---|---|---|
| iCloud / Drive 上のバックアップが部分同期で壊れる | 致命 | 既定でローカルフォルダ推奨。リストア前再ハッシュ。壊れた最新をスキップ。 |
| WAL サイドカー残留で復元 DB が汚染 | 致命 | チェックポイント必須。置換時サイドカー削除。テスト B03。 |
| `expo-print` がページ数を保証しない | 高 | 行数キャップ＋高さ予算＋発行拒否。2ページ検出時は発行失敗。 |
| SAF / security-scoped URL が期限切れ | 高 | 起動時に到達性チェック。失敗で赤バナー。LKG は生きる。 |
| マイグレーション改変の現場適用 | 高 | SQL ファイル checksum。不一致は起動拒否。 |
| 整数円でも数量ミリの溢れ | 中 | 範囲チェック。quantity_milli ≤ 1e9。 |
| ユーザが「最新に戻す」を連打し、直前入力の下書きを消す | 中 | pre_restore を必ず取る。成功画面で「直前状態も残した」とパスを示す。 |
| 端末紛失 | 中 | OS ロック前提。v1 は暗号化バックアップなし。設定に明記。 |
| 20行キャップが業務に足りない | 中 | v2 で「続きは別請求」分割発行。1 PDF 2ページは開かない。 |
| expo-sqlite の delete が WAL を残す | 中 | 自前でサイドカー削除。SDK 修正に依存しない。 |
| テストが HTML 見た目まで保証しない | 中 | ゴールデンは予算関数。実機で目視1回をリリースチェックリストへ。 |
| 買い切りでサーバが無いため遠隔キルできない | 低 | 仕様。データ保護には好都合。 |

---

## 10. 却下した代替案

| 案 | 却下理由 |
|---|---|
| JSON/NDJSON を正本 | 部分書き込みと型消失。件数10^4でも SQLite の方が検証できる。 |
| CSV エクスポートをバックアップと呼ぶ | 税スナップショットと監査が落ちる。補助エクスポートにはしてよいが復元経路にしない。 |
| iCloud 自動バックアップ任せ | 競合と同じ死に方をする。売りにできない。 |
| 毎日1件だけ残す | 昨日の成功バックアップが今日のバグ発行を含んで上書きされる。30日ローテ必須。 |
| リストア時にマージ | 衝突解決不能。オフライン単一正本では **置換のみ**。マージはデータ損失の別形態。 |
| 発行後もマスタから再表示 | 取引先改名で過去請求が書き換わる。保全失敗。 |
| 見積レコードの type を invoice に UPDATE | 監査不能。コピーが正。 |
| `synchronous=NORMAL` | 電源断で直近発行が消える余地を残す。本アプリの売りと矛盾。 |
| ハードデリート＋空き容量確保 | 980円の請求台帳で空き容量は問題にならない。消す権利より残す義務。 |
| 複数 PDF テンプレート | レイアウト契約が分岐し、1枚保証テストが爆発する。 |
| ORM マイグレーション自動生成 | 生成 SQL の checksum 運用が崩れる。手書き SQL を正とする。 |
| バックグラウンド日次だけ | iOS がタスクを落とす。起動時バックアップが正。 |
| バックアップ zip を暗号なしメール自動送信 | 宛先設定ミスが情報漏洩。共有は手動。 |
| 行ごと消費税を出して「参考」表示 | 参考が本則と1円ズレると問い合わせになる。出さない。 |

---

## 11. 他の観点への反論・懸念

この節は、簡潔さ・税/法務の厳密さ・UX 最適化を主目的にした設計と衝突する点を、データ保護の側から先に固定する。実装時に「面倒だから外す」対象になりやすい項目ほど、ここに理由を残す。

### 11.1 簡潔さ最適化への反論

**「起動時に PRAGMA を並べず、SQLite のデフォルトで十分」**  
拒否する。デフォルトの DELETE ジャーナルと `synchronous=NORMAL` は、発行直後のキルで直近1件を失い得る。1件の請求書喪失は本アプリのレビューを殺す。初期化 10 行を惜しまない。

**「マイグレーションは CREATE TABLE IF NOT EXISTS だけでよい」**  
拒否する。版管理のないスキーマは、追加列の有無が端末ごとに分岐し、バックアップを別端末（再インストール）へ戻せなくなる。`user_version` と checksum は冗長ではなく、バックアップ互換の契約である。

**「LKG とユーザフォルダの二重書きは過剰」**  
拒否する。ユーザフォルダは権限喪失・iCloud 部分同期・ユーザの誤削除で消える。LKG はアプリ削除で消える。片方は片方の失敗モードをカバーしない。二重は最小構成である。

**「JSON 1本で全部足りる。SQLite は重い」**  
拒否する。請求行は更新が局所的で、JSON 全体書き換えは更新のたびに台帳全体を賭ける。SQLite の方がこのドメインでは単純ですらある。

**「ソフトデリートはクエリを汚す」**  
`deleted_at IS NULL` を repo の既定にする。一覧 SQL を画面に書かせない。簡潔さは repo に閉じる。物理削除で「すっきり」したスキーマは、復元不能な欠番と参照切れを生む。

**「原子書き込みの再読込ハッシュは paranoia」**  
フラッシュ未完了のファイルを「書いた」と journal に残す方が怖い。再読込は安価で、B01 がそれを守護する。

### 11.2 税/法務正確性最適化への反論

**「チェックディジット不正の登録番号は保存できないようにすべき」**  
法務的には正しい方向だが、保存拒否は下書きごと捨てられる経路を作る。本設計は保存を許し、発行時に再確認する。誤番号の請求書が残っている方が、消えた請求書より確定申告でまだ戦える。

**「端数モードを書類ごとに変えられるべき」**  
法令は方法を任意としている。しかし書類ごと設定は、バックアップ間で「なぜ1円違う」比較不能を増やす。発行者デフォルト1つ＋スナップショットで十分。柔軟性より再現性。

**「電子帳簿保存法の検索要件・タイムスタンプまで v1 で」**  
保存要件を増やすほど書き込み経路が増え、失敗モードが増える。v1 の約束は「消えず戻せる請求書」まで。法務スコープを広げてバックアップ核を薄めてはならない。

**「PDF を正本にし、DB は索引だけ」**  
PDF は再計算不能で、リストア後の一覧・再発行・見積変換が死ぬ。正本は構造化 DB、PDF は派生物＋ハッシュ。両方残す。PDF だけ残る世界は、次の税率改正で手も足も出ない。

**「参考として行ごと税額を出すべき（経理担当が検算しやすい）」**  
検算しやすい表示は、誤った計算法を教育する。1円ズレた問い合わせより、税率1回の内訳だけを出す方が、結果として「正しい金額が残る」。

**「無効化ではなく訂正発行で上書き」**  
上書きは過去の送付済み PDF と DB を不一致にさせる。送付済みは凍結し、新しい番号で出し直す。法務の「正しい最終状態」より、時系列の保全を取る。

### 11.3 UX 最適化への反論

**「ワンタップ・リストアは確認なしが気持ちいい」**  
ワンタップは「最新を選ぶ」まで。適用は件数サマリと「今のデータを先に退避」を必ず見せる。誤タップ1回で今月の発行分が消える UX は、保護機能の敵である。

**「バックアップフォルダ設定を後回しにして、すぐ請求書を作らせる」**  
オンボーディング短縮は初週のアンインストール耐性を捨てる。作成は許可するが、赤バナーを消さない。気持ちよさより、再インストール後に戻せる状態を先に作る。

**「iCloud を既定フォルダにして、ユーザに選ばせない」**  
Files 連携の説明コストは下がる。その代わり競合と同じ失敗（戻らない iCloud）を買う。既定はローカル、iCloud は自己責任の明示選択。

**「21行以上も受け付け、フォントを限界まで縮め、ダメなら2ページ」**  
2ページ事故が競合の第3クレームである。読めないほど縮めた1ページより、発行拒否して分割を促す方が、送付後の修正（＝過去データ改変圧力）を生まない。

**「発行後も中身を直せる方が現場は助かる」**  
助かるのは当日の誤字だけである。その代わり「どれが送った版か」が消える。誤字は無効化＋再発行。UX の手数2回を、台帳の一意性と引き換えにしない。

**「自動で壊れた DB を LKG に戻す」**  
起動が「直った」ように見えて、ユーザが気づかず当日分を再入力し、後で両方中途半端になる。提案は自動、適用は確認。沈黙の修復は監査不能なデータ損失である。

**「ホームから保護ステータスを隠し、設定の奥に置く」**  
保護は機能ではなく状態表示である。最終バックアップが 48 時間以上前ならホームに出す。見えないバックアップは、無いのと同じ。

### 11.4 三観点が同時に欲しがる危険な妥協

「まずはシンプルに JSON、税は後で、UX はすぐ作れる、バックアップは iCloud」は、3つの観点がそれぞれ部分最適を取ったときに最も寄る点であり、本アプリの死因そのものである。v1 の核は逆である。

> SQLite 正本、整数税、発行凍結、起動時バックアップ、検証付き置換リストア、1枚 A4 以外は出さない。

この核を削って画面を増やす変更は、どれほど入力が気持ちよくても欠陥である。

---

## 12. v1 受け入れ基準（データ保護）

実装完了とみなす条件。すべて自動テストまたは実機手順で実証すること。

1. 電源断・プロセスキルを発行直後に入れても、再起動後 `integrity_check=ok` で、発行は「ある」か「ない」かであり、中途半端な行が残らない。
2. バックアップ payload を1バイト壊すとリストアが拒否され、live の SHA-256 が変わらない。
3. リストア失敗で live が開かなくなったケースでも、`swapped-out` から自動復帰し、失敗メッセージが「現データを保持した」と言える。
4. アプリ削除→再インストール→ユーザフォルダから復元で、発行済み件数と各 `pdf_sha256` が一致する。
5. マイグレーション失敗で旧 `user_version` のまま起動でき、pre_migrate から戻せる。
6. T01–T10 が CI で固定値一致。
7. 20行以内は常に `ok=true` のレイアウト予算。21行は作成できない。生成 PDF を人間が開いて2ページ目が無い。
8. 発行済み請求の取引先を改名しても、当該書類画面と再生成 PDF の宛名が変わらない。
9. 見積→請求で金額・税内訳がビット一致。
10. バックアップ未設定のまま使い続けてもクラッシュしないが、赤バナーが消えない。

以上を満たさない実装は、機能が揃っていても v1 未達とする。
