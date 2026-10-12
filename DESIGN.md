# オフライン請求・見積アプリ 最終設計書

- 対象: Expo（React Native / TypeScript / expo-router）の iOS / Android
- 位置づけ: 実装仕様。本書と矛盾する実装は未達。アプリのソースは本書の範囲外
- 販売: 買い切り **1,280円**。アプリ内課金なし。アカウントなし。サーバなし
- 裁定の経緯: `SYNTHESIS.md`

v1 でユーザーに約束すること:

1. 機内モードのまま、見積と請求を作り、A4 1枚の PDF を共有できる。
2. 発行した数値は、あとから取引先や設定を変えても、再計算しても、動かない。
3. アプリを消す前にユーザーが選んだフォルダへ、検証済みのバックアップが残る。壊れたファイルでは、いまの台帳を上書きしない。
4. 登録番号を書いた請求は、10% と 8% を税率ごとに1回だけ端数処理した内訳を持つ。番号が無い請求を適格請求書とは呼ばない。

---

## 1. 原則

| # | 原則 | 帰結 |
| --- | --- | --- |
| P1 | 正本は SQLite 1ファイル | 画面状態、AsyncStorage、JSON 台帳を正本にしない |
| P2 | 唯一のコピーを検証前に上書きしない | 一時ファイル、ハッシュ、`integrity_check`、rename の順 |
| P3 | 発行済みは不変 | 直すときは新しい番号。旧行は残す |
| P4 | 金額経路に浮動小数を入れない | 円は整数。数量は千分の1の整数。税は整数除算 |
| P5 | やり方は1つ | 端数は切捨て。税は税抜。テンプレートは1つ。容器は `.invbak` だけ |
| P6 | A4 は測らず計算する | モデル1の高さが安全係数込みで 273mm を超えたら発行しない |
| P7 | 日次は起動と発行のあと | OS のバックグラウンド実行には賭けない |
| P8 | マイグレーションは退避の成功後だけ | 失敗したら旧スキーマのまま修復画面へ |

v1 でやらないこと:

- サーバ、同期、複数端末、分析、クラッシュ送信
- アプリ内課金、無料期間、透かし
- 修正インボイス、適格返還請求書、領収書、納品書
- 源泉徴収の自動計算、税込入力、端数モードの選択、外貨
- ロゴ、角印、複数テンプレート、英語、和暦
- 入金消込、銀行連携、グラフ、時間計測
- 電子帳簿保存法のタイムスタンプと検索要件の完全対応をストアで名乗ること
- SQLCipher、バックアップのパスワード、起動必須の生体認証

---

## 2. ライブラリ

実装開始時の Expo SDK 安定版を `package.json` にピンする。v1 のあいだメジャーは上げない。上げるときは、空 DB へのマイグレーション、税ゴールデン、バックアップ往復、レイアウトモデル1、実機での1枚確認を通してからにする。

### 2.1 採用

| ライブラリ | 役割 | 理由 |
| --- | --- | --- |
| `expo-router` | 画面 | ファイルがルート。画面数をこの木で上限にする |
| `expo-sqlite` | 正本 | 同期 API（`openDatabaseSync`）。WAL、トランザクション、`integrity_check`、`user_version` |
| `expo-file-system` | ファイル | 一時ファイル、rename、Documents、セキュリティスコープ付き URL |
| `expo-crypto` | SHA-256 | 自前ハッシュを書かない。バックアップ ID の乱数もここから取る |
| `expo-print` | PDF | `printToFileAsync`。オフラインで完結する公式経路 |
| `expo-sharing` | 共有 | PDF と `.invbak` を OS の共有シートへ渡す。自前の送信 UI は持たない |
| `expo-document-picker` | 復元と保存先 | ユーザーがファイルまたはフォルダを明示選択する |
| `fflate` | ZIP | `.invbak` を無圧縮 ZIP として読む書く。ネイティブ圧縮を足さない |
| `zod` | バックアップ封筒だけ | 壊れた JSON を部分適用しない。画面フォームのライブラリには使わない |
| Jest + `ts-jest` | ゴールデン | 税、レイアウト、封筒、採番を Node で固定する |

フォントは依存パッケージにしない。`assets/fonts/NotoSansJP-Regular.subset.ttf` と、同じ文字集合の `assets/fonts/allowed-codepoints.txt` をリポジトリに置く。ライセンスは SIL Open Font License。HTML では `@font-face` に Base64 で埋め込み、`font-family` は `InvoiceJP` だけを指定する。フォールバックスタックは書かない。

UI は `StyleSheet` と、§7 の部品だけにする。

日付のタイムゾーン変換ライブラリは入れない。日本時間の日付は `domain/dates.ts` の純関数（UTC epoch に 9時間を足して暦日を切る）だけが作る。

### 2.2 入れないもの

| 候補 | 理由 |
| --- | --- |
| Drizzle / Prisma / WatermelonDB / Realm | 発行済み UPDATE の禁止と、手書き SQL のチェックサムが隠れる |
| AsyncStorage / MMKV / `expo-secure-store` | 正本が割れる。鍵を端末だけに置くと機種変でバックアップが開けなくなる |
| Zustand / Redux / TanStack Query | サーバが無い。編集中の1書類だけ React state で足りる |
| `date-fns` / Temporal ポリフィル | 暦日文字列と 9時間シフトで足りる |
| `nanoid` / UUID パッケージ | 主キーは整数。番号は採番器 |
| `expo-iap` / RevenueCat | 買い切りアプリにする |
| `expo-background-task` / background fetch | 実行されない日が「成功した日」に見える |
| `react-hook-form` | 明細の増減が本体で、フォームライブラリがタップを増やす |
| SQLCipher / 生体認証必須 | 鍵の喪失が、この製品の「消えた」になる |
| Sentry 等の分析 | 請求データが端末の外へ出る経路を最初から持たない |
| `pdf-lib` をアプリ本体に | 描画経路が2つになる。テスト専用にも CI には置かない |
| Playwright / Puppeteer の PDF CI | Chromium の1枚は `expo-print` の1枚ではない |
| iCloud / Drive SDK | 競合の復元失敗と同じ場所を本線にしない |

### 2.3 権限とファイル共有フラグ

`app.json` に次を入れる。

- iOS: `UIFileSharingEnabled = true`、`LSSupportsOpeningDocumentsInPlace = true`
- Android: レガシーな `WRITE_EXTERNAL_STORAGE` は要求しない。保存先は Storage Access Framework の永続許可だけ

権限を拒否されても、発行と編集は止めない。ホームのチップを赤にし、「この端末を消すと、アプリ内のコピーも消える」と書く。

---

## 3. データ表現

### 3.1 金額と数量

通貨は JPY のみ。金額列はすべて `INTEGER` の円。

```ts
type Yen = number & { readonly __brand: 'Yen' };
type QuantityMilli = number & { readonly __brand: 'QuantityMilli' };
type TaxCategory = 'standard_10' | 'reduced_8' | 'non_taxable';
```

実行時は「整数であり、§4 の CHECK 範囲内」をリポジトリの入口で見る。`Yen` のブランドはコンパイル時の取り違え防止であり、実行時のクラスにはしない。

- 単価は税抜円。負数は値引き行だけ可。
- 数量は正のミリ。`1.5` 時間は `1500`。画面は末尾の 0 を落として「1.5」と出す。
- 行金額は税の端数処理ではない。`divFloor(単価 × quantity_milli, 1000)`。
- 1書類の中に税込行は無い。品目フォームの「税込から入れる」補助は、保存前に `divFloor(税込 × 100, 110)` または `divFloor(税込 × 100, 108)` で税抜へ落とし、保存値は税抜だけにする。この補助は標準と軽減だけで、対象外には出さない。

`divFloor` は負の無限大方向である。`BigInt` の除算はゼロ方向なので、そのまま使わない。定義は §5.1。

### 3.2 税率

| 区分 | 表示 | 税額 |
| --- | --- | --- |
| `standard_10` | 10% | 税抜合計 × 10 / 100 を1回切捨て |
| `reduced_8` | 8% と `※` | 税抜合計 × 8 / 100 を1回切捨て |
| `non_taxable` | 対象外 | 0。10% にも 8% にも足さない |

非課税と不課税は v1 では分けない。画面のラベルは「対象外」。ヘルプに「非課税と不課税を区分しない」と書く。

端数モードの値は `'floor'` だけ。書類行に焼き付ける。設定では選ばせない。

### 3.3 登録番号

保存は空文字か、正規化済みの `T` + 数字13桁。

正規化:

1. NFKC
2. 空白と全角スペースを除く
3. 先頭の `t` / `T` を `T` にする

判定は `/^T[0-9]{13}$/` のみ。法人番号の検査数字は使わない。個人事業主の番号を落とすためである。空は免税・登録前として許す。形式を満たさない文字列は発行者プロフィールに保存しない。

### 3.4 書類

見積と請求は同一テーブル。`kind` は `'quote' | 'invoice'`。

| status | 意味 | 編集 | 削除 |
| --- | --- | --- | --- |
| `draft` | 番号なし | 可 | 物理削除可 |
| `issued` | 番号確定、スナップショット凍結 | 不可 | 不可 |
| `voided` | 発行済みに無効の印を付けた | 不可 | 不可。行と PDF ハッシュは残る |

`sent` と `paid` は持たない。共有シートを閉じたことは状態にしない。共有に失敗しても発行済みは発行済みのままである。

見積から請求は、発行済み見積の明細を新しい `invoice` / `draft` へコピーする。`source_document_id` を付ける。見積の `status` は `issued` のまま。同じ見積から複数回コピーしてよい。請求を見積に戻す操作は無い。

「前回と同じ」は、直近の `issued` な請求（無効を除く）を、別の新しい下書きへコピーする。`source_document_id` は付けない。発行日は今日（日本時間の暦日）、支払期限は翌月末、番号は空。

### 3.5 スナップショット

発行トランザクションが、その時点の値を書類列へ書く。PDF と詳細画面は、この列と `document_lines` と `document_tax_totals` だけを読む。取引先マスタや発行者プロフィールを JOIN して表示しない。

焼くもの: 取引先名、敬称、住所、発行者名、住所、電話、メール、登録番号、振込先の1文字列、端数モード、レイアウト段階、モデル版、フォント版、税率別の課税標準と税額、合計。

下書きはマスタの `client_id` を持ち、編集画面を開いたときに生きているマスタから宛先欄を読み直してよい。発行後は読み直さない。

### 3.6 日付

- `issue_date` と `due_date` は `YYYY-MM-DD`。ユーザーが選んだ暦日を、タイムゾーン変換せず保存する。
- `created_at` ほか監査時刻は UTC epoch ミリ秒の `INTEGER`。
- 「今日」「日次の日付境界」「翌月末」は日本時間。`domain/dates.ts` 以外で `Date#getDate` を使わない。

翌月末は、その暦日の翌月の最終日である。12月の翌月は翌年1月で、最終日は1月31日。1月31日の翌月は2月で、最終日は平年28日、うるう年29日。例は §8.3。

### 3.7 文字幅

A4 モデルとフォントサブセットは同じ文字集合を使う。

- 許可: `allowed-codepoints.txt` に含まれる符号位置
- それ以外の貼り付けは拒否し、「この文字は請求書に使えません」と欄の下に出す
- `visualLength`: 許可文字のうち ASCII（U+0020–U+007E）と半角カナ（U+FF61–U+FF9F）は 0.5、それ以外は 1

フィールド上限（visualLength）:

| 欄 | 上限 |
| --- | --- |
| 発行者名、取引先名 | 40 |
| 住所、振込先 | 80 |
| 明細の品名 | 80 |
| 備考 | 200 |
| 件名 | 40 |
| 無効理由 | 80 |

明細は1書類 40行まで。41行目はフォームが拒否する。40行でもモデルが拒否することがある。そのときは行を減らす。

### 3.8 バックアップ封筒

物理形式は無圧縮 ZIP。拡張子 `.invbak`。ファイル名は `invoice-YYYYMMDD-HHmmss-{kind}.invbak`。日付時刻は日本時間。

```
manifest.json
payload.sqlite
payload.sha256
```

`payload.sha256` は `payload.sqlite` のバイト列の SHA-256 を小文字 hex と改行1つで書いたテキスト。`manifest.json` の `dbSha256` と一致必須。

```ts
type BackupManifestV1 = {
  format: 'invoice-backup';
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  createdAt: string; // ISO-8601 UTC
  backupId: string;  // hex 16文字。expo-crypto の乱数
  kind: 'daily' | 'pre_migrate' | 'pre_restore' | 'manual' | 'lkg';
  dbByteLength: number;
  dbSha256: string;
  rowCounts: {
    clients: number;
    items: number;
    documents: number;
    document_lines: number;
    document_tax_totals: number;
  };
  latestIssuedDocumentNo: string | null;
  issuerName: string | null;
};
```

PDF は容器に入れない。発行済みの再生成に必要な段階と数値は SQLite にある。

---

## 4. SQL スキーマとマイグレーション

### 4.1 接続時 PRAGMA

毎回、マイグレーションより先に適用する。

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
```

`synchronous=NORMAL` は使わない。発行直後のプロセス停止で、直前のコミットが消える余地を残さない。

### 4.2 マイグレーション規約

ファイルは `lib/db/migrations/001_init.sql` の番号順。各ファイルの SHA-256（ファイルバイト列そのもの）を `lib/db/migrations/001_init.sql.sha256` にコミットする。ハッシュを SQL の中に書かない。書くとハッシュが変わる。

ランナー:

1. DB を開き §4.1 を適用する。
2. 適用しようとしている SQL のハッシュが、隣の `.sha256` と違えば起動を拒否する。
3. `schema_migrations` が無く、ユーザーテーブルも無い（新規）なら `001` を適用する。
4. ユーザーテーブルがあるのに `schema_migrations` が無い、または `PRAGMA user_version` と `max(version)` が一致しないなら、修復画面だけを出す。推測で直さない。
5. 未適用の版があるとき、先に `kind='pre_migrate'` のバックアップをアプリ内と、フォルダが生きていればユーザーフォルダの両方へ書く。検証失敗なら適用しない。
6. `BEGIN IMMEDIATE`、SQL、`INSERT INTO schema_migrations`、`PRAGMA user_version = N`、`COMMIT`。
7. 直後の `integrity_check` が `ok` でなければ、手順5の退避へ戻し、修復画面を出す。

v1 の出荷物は `001` のみ。`002` 以降は列追加と、新しい CHECK のためのテーブルコピーだけを許す。`DROP TABLE`、`DROP COLUMN`、発行済み行の UPDATE、既存 CHECK の狭めは禁止。

### 4.3 `001_init.sql`

```sql
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
```

`ON DELETE RESTRICT` は意図的である。発行済みの親を CASCADE で消さない。下書きの削除は、リポジトリが税集計、明細、書類の順に同じトランザクションで DELETE する。`status <> 'draft'` の DELETE はリポジトリが拒否する。

`UNIQUE(kind, doc_no)` は、SQLite では `doc_no IS NULL` の下書きを複数許す。

初期データ: `issuer_profile` の `id=1` が無ければ挿入する。`schema_migrations` に version 1、名前 `001_init`、SQL ファイルのハッシュ、時刻を入れる。空の DB でもバックアップは一貫した空として成立させる。

`app_kv` のキーは次だけ。

| key | 値 |
| --- | --- |
| `backup.ios_bookmark` | security-scoped bookmark |
| `backup.android_uri` | SAF の永続 URI |
| `backup.folder_skipped` | `'1'` ならユーザーが未設定のリスクを見た |
| `hint.export_once` | `'1'` なら初回の退避案内を出した |

最終バックアップ時刻の正本は `backup_journal` である。`app_kv` に複製しない。

### 4.4 採番

```
請求  INV-{year}-{seq:4}
見積  QUO-{year}-{seq:4}
```

`year` は `issue_date` の西暦4桁。端末時計の年ではない。

発行トランザクションの中でだけ行う。

```
SELECT last_value FROM number_sequences WHERE kind=? AND year=?
無ければ INSERT (kind, year, 0)
next = last_value + 1
UPDATE last_value = next
書類の doc_no を UNIQUE で更新
```

ロールバックすれば番号も戻る。コミット後に PDF の rename が失敗しても、番号は消費したままにする。欠番は許容、再利用は禁止、手入力 UI は置かない。

---

## 5. 主要アルゴリズム

### 5.1 税

唯一の関数を `domain/tax.ts` の `calculateTotals(lines)` とする。画面、リポジトリ、PDF はこれを呼ぶ。コピーを書かない。

```ts
function divFloor(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('divisor');
  const q = n / d;
  const r = n % d;
  if (r !== 0n && n < 0n) return q - 1n;
  return q;
}

function lineAmountYen(unitPriceYen: number, quantityMilli: number): number {
  return Number(divFloor(BigInt(unitPriceYen) * BigInt(quantityMilli), 1000n));
}

function taxOnce(baseYen: number, rate: 0 | 8 | 10): number {
  return Number(divFloor(BigInt(baseYen) * BigInt(rate), 100n));
}
```

手順:

1. 各行の `amount_yen = lineAmountYen(...)`。
2. 区分ごとに `base` を合計する。行が無い区分はバケットを作らない。
3. `standard_10` の税は `taxOnce(base, 10)`。`reduced_8` は `taxOnce(base, 8)`。`non_taxable` の税は 0。
4. `subtotal_yen` は全部の行金額の合計（対象外を含む）。
5. `tax_yen` は 10% の税と 8% の税の合計。
6. `total_yen = subtotal_yen + tax_yen`。

禁止:

- 行ごとに税を出して足す
- 10% と 8% を足してから割る
- `Math.round`、`Math.floor(x * 0.08)`、`* 0.1`
- 画面に行の消費税を出す

0円のバケットは PDF にも画面にも出さない。軽減行が1つでもあれば、集計の下に「※は軽減税率（8%）の対象です。」を出す。この文の高さは合計ブロックの固定 30.0mm の内側に収める。モデルの高さを行の有無で変えない。

下書き保存は、行の置換と `calculateTotals` の書き戻しを同一トランザクションで行う。一覧は保存済み列を読む。

### 5.2 発行

ゲート。1つでも失敗なら DB を発行状態にしない。

- `status === 'draft'`
- 明細が1行以上、40行以下
- 発行者名と取引先名が空でない（スナップショット元）
- 登録番号は空か `/^T[0-9]{13}$/`
- `chooseStage` が段階を返す（`refuse` ではない）
- 文字が許可リスト内、visualLength が §3.7 以内

手順:

1. ゲートと `calculateTotals` と `chooseStage` を実行する。
2. HTML を描き、`printToFileAsync({ html, width: 595, height: 842 })` で一時 PDF を書く。失敗したらここで終わる。下書きのまま。番号は消費しない。
3. 一時 PDF のサイズが 0 なら失敗。SHA-256 を計算する。
4. `BEGIN IMMEDIATE`。下書きを読み直し、合計が手順1と違えば ROLLBACK（実装バグ）。
5. 採番。スナップショット列、合計、`document_tax_totals`、`layout_stage`、`layout_model_version=1`、`font_subset_version`、`issued_at`、`status='issued'` を書く。`pdf_relpath` はまだ null でよい。
6. `COMMIT`。
7. 一時 PDF を `pdfs/{id}.pdf` へ rename し、`pdf_relpath` と `pdf_sha256` を短い UPDATE で書く。この UPDATE は発行済みに対する唯一の例外で、パスとハッシュが null のときだけ許す。本文、明細、合計、番号は SET 句に含めない。
8. 監査 `issue` を書く。今日の日次バックアップを走らせる。バックアップ失敗で発行をロールバックしない。チップを赤くし、共有シートで `.invbak` を外へ出す導線を出す。
9. 共有シートを開く。

クラッシュが 6 と 7 のあいだに起きた場合、起動時に `issued` かつ `pdf_relpath IS NULL` を見つけ、スナップショットと保存済み段階で PDF を作り直す。数値は再計算しない。`calculateTotals` の結果と保存済み合計が違えば作り直さず、修復画面へ出す。

無効化は別トランザクション。`issued` だけを対象にし、`status='voided'`、`void_reason`、`voided_at` だけを更新する。明細と合計と PDF ハッシュは触らない。

### 5.3 A4 モデル1

実装ファイルは `domain/layout/model1.ts`。出荷後にこのファイルの定数を編集しない。変えるときは `model2.ts` を追加し、新しい下書きだけがモデル2を使う。発行済みは `layout_model_version` の実装だけで再生成する。

用紙は A4。余白は四辺 12mm。本文領域の高さは 273.0mm。単位は 0.1mm の整数。安全係数は 1.03。採用条件は `usedTenth * 103 <= 2730 * 100`。

固定（0.1mm）:

| 部位 | 値 |
| --- | --- |
| 当事者ブロック | 340 |
| 合計ブロック（凡例を内側に含む） | 300 |
| フッタ | 60 |

段階:

| 段階 | ヘッダ | 振込 | 行送り | 上下パディング片側 | 品名の1行あたり文字 | 備考の1行あたり文字 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| comfortable | 240 | 140 | 48 | 16 | 27 | 40 |
| compact | 220 | 120 | 43 | 12 | 30 | 44 |
| dense | 200 | 120 | 38 | 8 | 34 | 50 |
| emergency | 180 | 100 | 34 | 6 | 39 | 56 |

文字数は、フォント 10 / 9 / 8 / 7pt、品名列幅 92mm、`floor(92 / (pt × 0.3528 × 0.95))` から切った値である。実行時に pt から再計算しない。表の整数だけを使う。

```
rowTenth(wrap) = padTenth * 2 + wrap * lineTenth
wrap = max(1, ceil(visualLength(description) / charsPerLine))
table = rowTenth(1) /* 見出し行 */ + Σ rowTenth(wrap of line)
notes = 0 if visualLength(notes)==0
      else ceil(visualLength(notes) / noteCharsPerLine) * lineTenth + 20
fixed = header + 340 + 300 + bank + 60
used  = fixed + table + notes
```

`chooseStage` は comfortable から emergency の順に試し、条件を満たす最初の段階を返す。どれも満たさなければ `refuse`。発行ボタンを無効にし、「A4 の1枚に入りません。明細を減らすか、品名と備考を短くしてください。」と出す。2ページには出さない。自動で2枚の請求に分割しない。備考を黙って切らない。`overflow: hidden` をページに付けない。

`printToFileAsync` の幅 595、高さ 842 は 72pt/inch の A4。CSS は `@page { size: A4; margin: 12mm; }`。明細の字の大きさは段階の pt（10 / 9 / 8 / 7）をインラインで書く。`clamp()` と、ブラウザ任せの改ページは使わない。

短い品名（折返し1）・備考なしのときの段階は、上の定数から次のとおり決まる。テストはこの境界を期待値にする。

| 行数 | 段階 |
| ---: | --- |
| 1〜18 | comfortable |
| 19〜23 | compact |
| 24〜29 | dense |
| 30〜35 | emergency |
| 36〜40 | refuse（フォームは40行まで作れるが発行できない） |

### 5.4 PDF の中身

テンプレート関数は1つ。`kind` から表題を決める関数も1つ。`quote` なら「見積書」、`invoice` なら「請求書」。文字列をテンプレートに直書きしない。

請求で登録番号があるときだけ、番号の下に「登録番号 T.............」を出す。この行が適格請求書であることの表示である。「これは適格請求書です」という定型文は紙面を食うので置かない。登録番号が空の請求には、登録番号行を出さない。

見積には、登録番号があれば参考として出してよい。表題を「適格請求書」にしない。

必ず出すもの:

- 表題、番号（発行後）、発行日、支払期限または有効期限
- 宛先名と敬称
- 発行者名。登録番号は上の条件のときだけ
- 明細: 品名、数量、単位、税抜単価、金額。軽減行の品名先頭に `※`
- 区分ごとの税抜合計と消費税。対象外は税抜き金額だけ
- 合計
- 振込先（空ならブロックの高さだけ空き、文言は出さない）
- 備考（空なら高さ 0。モデルの notes=0 と一致させる）

行の消費税、源泉、入金済み印は出さない。

### 5.5 バックアップ

プロセス内にロックを1つ置く。発行トランザクションのあいだはバックアップを始めない。バックアップのチェックポイントのあいだは発行を始めない。

書くタイミング:

| きっかけ | kind |
| --- | --- |
| 前面化時、最後の成功した `daily` の日本時間の日付が今日でない | `daily` |
| 発行コミットの成功直後 | `daily`（今日のファイルを原子的に置き換える） |
| 設定の「今すぐ」 | `manual` |
| 未適用マイグレーションの直前 | `pre_migrate` |
| 復元で本番を触る直前 | `pre_restore` |
| 上のいずれかがユーザーフォルダまで成功したあと | `lkg` をアプリ内で世代回転 |

`exportBackup(kind)`:

1. `PRAGMA wal_checkpoint(FULL)`。失敗なら中止。本番は触らない。
2. チェックポイント済みの DB ファイルだけを一時パスへバイトコピーする。`-wal` と `-shm` はコピーしない。
3. 一時 DB を別接続で開き、`integrity_check` が `ok`、`foreign_key_check` が空、`user_version` がアプリの対応版以下、必須テーブルがあること。失敗なら一時ファイルを捨てて中止。
4. SHA-256、manifest を作り、zod で自分自身を読み戻す。
5. `fflate` で無圧縮 ZIP を `*.invbak.tmp` に書く。
6. ZIP を読み戻し、中の sqlite のハッシュと長さと `rowCounts` を照合する。
7. 照合できたら最終名へ rename する。
8. 同じバイト列でアプリ内 LKG を更新する。旧 `lkg.invbak` を `lkg.prev.invbak` へずらしてから、新しいファイルを `lkg.invbak` にする。ずらす前の prev は、新しい LKG の検証後に消す。
9. `backup_journal` に `ok=1` を書く。
10. ユーザーフォルダの `daily` が検証済みで31個目になるとき、最も古い `daily` を消す。消すのは手順6と7が成功したあとだけ。`pre_migrate` は別枠で5個。`pre_restore` は直近1個を次の復元まで残す。`manual` は日次とは別に直近10個。

ユーザーフォルダが無い、または URI が死んでいるときは、手順7のユーザー側をスキップし、journal に `error='no_user_folder'` を残す。LKG はそれでも更新する。発行は止めない。

置き場所:

- LKG: `{documentDirectory}/lkg/lkg.invbak` と `lkg.prev.invbak`
- アプリ内の見えるコピー: `{documentDirectory}/Backups/`（ファイルアプリの「この iPhone 内 / アプリ名」）
- アンインストール後に残るコピー: ユーザーが選んだフォルダ。iOS は bookmark、Android は SAF。案内文の推奨は iCloud ではなく「この iPhone 内」のフォルダ。iCloud を選んだときは「同期の途中のファイルでは復元できません」と警告する

起動時の自己診断:

- DB を開けない、または `integrity_check` が `ok` でない: 通常 UI を出さない。修復画面で、検証できるバックアップの選択だけを出す。空の DB を自動作成しない。LKG への自動上書きもしない。
- 開ける: 通常 UI。チップの色は、最後の `ok=1` かつファイルがまだ読めるバックアップから決める。24時間以内は緑「バックアップ済」、7日以内は琥珀、それより前か0回か直近失敗は赤。

### 5.6 復元

ワンタップの意味は、「最新の検証済みを選ぶ操作をユーザーにさせない」である。確認を省く意味ではない。

復元画面を開くと、journal の新しい順に、ファイルが存在し、手順3まで再検証できた最初の1件を選択済みにする。壊れた最新は飛ばして1つ前を選ぶ。二次アクションとして document picker を残す。

`restore(uri)`:

1. アプリ一時領域へコピーする。本番はまだ開いたまま。
2. ZIP を展開する。manifest を zod で検証する。`formatVersion` が 1 より大きい、または `schemaVersion` がアプリの対応上限より大きいときは拒否する。
3. sqlite のハッシュ、長さ、`payload.sha256`、manifest の3者が一致すること。
4. 一時接続で `integrity_check`、`foreign_key_check`、`rowCounts` が manifest と一致すること。
5. いまの本番に対する `pre_restore` が成功しなければ中止する。文言は「いまのデータを退避できなかったので、戻していません」。
6. 全接続を閉じる。`-wal` と `-shm` を消す。本番を `app.db.swapped-out` へ rename する。payload を本番パスへ rename する。
7. 開き直し、必要なら §4.2 のマイグレーション、`integrity_check`。
8. 失敗したら本番パスを捨て、`swapped-out` を戻す。「戻していません。いまのデータはそのままです」。
9. 成功したら監査 `restore` を、復元後の DB に書く。`swapped-out` は次の復元まで残す。

部分的に「読めたテーブルだけ入れる」ことはしない。

PDF ファイルが復元先に無い発行済みは、詳細を開いたときに保存済みの `layout_stage` と `layout_model_version` と `font_subset_version` で再生成する。フォント版がアプリの同梱版と違うときは再生成してよいが、「数値は発行時の記録です。PDF のバイト列は発行時と一致しません」と出す。合計列を再計算して上書きしない。

### 5.7 見積から請求、前回と同じ

どちらも新しい `draft` を INSERT し、明細行を新しい `document_id` で INSERT する。合計は `calculateTotals` で書き戻す。元の行は UPDATE しない。

コピー後に単価を変えてよい。変えた結果、見積と請求の税額が違うのは正常である。発行前の画面に「見積の金額は引き継いでいます。発行時に計算し直します」と1行出す。見積側の `tax_yen` を請求の列へコピーしない。

---

## 6. 画面フロー

タブは4つ。品目タブは作らない。

```
[ホーム] [書類] [取引先] [設定]
```

ルート:

```
app/
  _layout.tsx                 # open、PRAGMA、migrate、修復分岐、日次の起動チェック
  setup.tsx                   # 初回の発行者
  (tabs)/index.tsx            # ホーム
  (tabs)/documents.tsx
  (tabs)/clients.tsx
  (tabs)/settings.tsx
  editor/[id].tsx             # 見積と請求の同一編集。発行済みは読み取り
  backup.tsx
  restore.tsx
  repair.tsx                  # integrity 失敗時の唯一の UI
```

これ以外のルートを足すときは、既存のどれを消すかを先に `DESIGN.md` に書く。

### 6.1 初回

1画面目は発行者。必須は屋号または氏名だけ。住所、電話、メール、振込先（1欄）、登録番号は空で進める。登録番号を入れた場合は形式が通るまで次へ進めない。端数と税込/税抜は聞かない。

2画面目はバックアップ先。「保存先を選ぶ」が主ボタン。「あとで」は「この端末を消すとバックアップも消えます」にチェックを入れてから押せる。チェックせずに閉じられない。

### 6.2 ホーム

- 主ボタン「請求書を作る」。押したら空の `invoice` 下書きを INSERT し、`/editor/{id}` へ進む。
- その横に小さい「見積」。同様に `quote` の下書きを作る。
- 「前回と同じ」。直近の発行済み請求があるときだけ。§5.7 の複製のあと編集へ。
- 直近取引先のチップ最大5。`last_used_at`。タップでその取引先の請求下書きを作る。
- 下書きが残っていれば「続きから」最大3。自動では消さない。
- バックアップチップ。タップで `backup.tsx`。
- 直近書類3件。

空のホームは図を置かない。主ボタンと、「データはこの端末の中にあります。バックアップファイルを自分のフォルダに残します。」の2行だけ。

### 6.3 編集

下書きだけ編集できる。発行済みでこのルートを開くと、読み取り専用の詳細になる。

- 上部セグメントは下書きのあいだだけ「見積 | 請求」。
- 件名の初期値は `{取引先名} {発行月}月分`。空のまま発行してもよい。
- 日付の初期値は今日。期限のチップは翌月末（初期）、今月末、14日後、なし。見積のときはラベルを「有効期限」にする。
- 宛先をタップするとシート。検索、直近、`この名前で追加`。追加は `clients` へ INSERT してから書類の `client_id` を付ける。マスタ画面へ遷移しない。
- 明細は行タップで数量と単価のテンキー。税率は `10%` / `8%` / `対象外`。下に品目チップと「空行を足す」。スワイプでその行を削除。
- 合計ブロックは `calculateTotals` の戻り値だけを、折りたたまずに出す。直下に「税率ごとの税抜合計に対して、円未満を切り捨てています。」
- 備考。
- フッタ主ボタンは下書きなら「発行して送る」。`chooseStage` が `refuse` のときは無効。
- 発行確認モーダルの主文は「発行すると、この内容は変更できません。誤りは新しい番号で出し直します。」副文に、登録番号が空なら「登録番号が無いので、適格請求書としては出しません。」
- 発行済みのフッタは「PDF を送る」「複製して下書き」。見積なら「請求書にする」。請求の `issued` なら「無効にする」（理由必須）。編集ボタンは置かない。

前回と同じから再発行する操作は、複製を開く、発行して送る、モーダルで確定、共有先、の4アクションである。確認モーダルを削って3タップにはしない。

### 6.4 書類一覧と取引先と設定

書類一覧のセグメントは、すべて / 下書き / 請求 / 見積 / 無効。行は番号、取引先、合計、日付。

取引先は一覧、検索、編集、非表示（`deleted_at`）。発行済みがあっても非表示にしてよい。スナップショットが正本だからである。下書きが参照していたら、非表示の前に「下書きの宛先欄は残ります」と出す。

設定:

- 発行者（登録番号を含む）
- 品目一覧
- 標準の期限ルール
- バックアップ（最終成功、今すぐ、保存先、世代一覧、復元）
- 「データについて」: バックアップは平文であること、修正インボイスはこの版では作らないこと、税務判断は利用者の責任であること

端数の設定項目は置かない。源泉の設定項目も置かない。

### 6.5 復元と修復

復元は1画面。選択中ファイルの作成時刻、取引先件数、書類件数、発行済み件数、ハッシュ先頭8文字を見せる。主ボタンは1つ、「退避してから置き換える」。確認ダイアログを3枚重ねない。

失敗時の文:

| コード | 文 |
| --- | --- |
| `HASH_MISMATCH` | このファイルは途中で切れているか、書き換わっています。別の日付を選んでください。 |
| `INTEGRITY_FAIL` | 中の台帳が壊れています。別の日付を選んでください。 |
| `SCHEMA_TOO_NEW` | このバックアップは、より新しい版のアプリで作られています。 |
| `PRE_RESTORE_FAILED` | いまのデータを退避できなかったので、戻していません。 |

修復画面は、通常タブを出さない。主ボタンは「バックアップから復元」。

---

## 7. モジュール構成

```
app/                         # 画面。expo-sqlite を import しない
components/
  Button.tsx
  Field.tsx
  Confirm.tsx
  LineEditor.tsx
  AmountKeypad.tsx
  ClientSheet.tsx
  TotalsBlock.tsx
  BackupChip.tsx
lib/
  db/
    open.ts                  # 単一接続、PRAGMA
    migrate.ts
    migrations/001_init.sql
    migrations/001_init.sql.sha256
    repos/issuer.ts
    repos/clients.ts
    repos/items.ts
    repos/documents.ts       # 下書き保存、発行、無効、複製。書込の唯一の口
    repos/backups.ts
  domain/
    money.ts                 # divFloor
    tax.ts                   # calculateTotals
    dates.ts                 # 日本時間の暦日、翌月末
    docNo.ts                 # 書式だけ。採番の副作用は repo
    registrationNo.ts
    layout/model1.ts         # chooseStage。出荷後編集禁止
    snapshot.ts              # 発行時に焼くフィールドの一覧
  backup/
    manifest.ts              # zod
    exportBackup.ts
    restore.ts
    rotate.ts
    userFolder.ts
  pdf/
    font.ts                  # サブセットの Base64 と版番号
    template.ts              # HTML。model と stage を引数で受け取る
    render.ts                # expo-print
tests/
  golden/tax.test.ts
  golden/layout.model1.test.ts
  golden/registration.test.ts
  golden/dates.test.ts
  backup.test.ts
  migrate.test.ts
```

依存の向き:

```
app, components → repos, domain, pdf, backup
repos           → db, domain
pdf             → domain
backup          → db, domain
domain          → 何も import しない（react も expo も fs も不可）
```

`documents` リポジトリの発行関数だけが、発行済み行を `issued` に変えてよい。それ以外の UPDATE で `status`、合計、スナップショット、明細を変更する関数は作らない。パスとハッシュの後書きは §5.2 の手順7だけ。

CI で `lib/domain/**` から `react` と `expo-sqlite` と `expo-print` を import していたら失敗させる。

---

## 8. テスト戦略

CI は Jest だけ。税の正否を実機 E2E に預けない。Detox も Maestro も v1 では入れない。

期待値は手でファイルに書く。テストの中で同じ式を呼んで期待値を作らない。行ごと切捨ての値を「正解」としてコミットしない。

### 8.1 税

`calculateTotals` だけを見る。すべて税抜、切捨て。

| ID | 入力 | 期待 |
| --- | --- | --- |
| T01 | 税抜 1000、10%、数量 1000 | 税 100、合計 1100 |
| T02 | 税抜 101、10% | 税 10、合計 111 |
| T03 | 税抜 99、10% | 税 9、合計 108 |
| T04 | 55 と 55、どちらも 10% | 課税標準 110、税 **11**。行ごとなら 5+5=10。10 を期待値にしない |
| T05 | 101 円を 10行、10% | 課税標準 1010、税 **101**。行ごと 10×10=100 を期待値にしない |
| T06 | 1000 の 10% と 800 の 8% | 税 100 と 64。合計 1964 |
| T07 | 税抜 108、8% | 税 8、合計 116 |
| T08 | 対象外 200 と 標準 100 | 対象外 200、税 10、合計 310。対象外を 10% に混ぜない |
| T09 | 数量 1500、単価 1000、10% | 行金額 1500、税 150、合計 1650 |
| T10 | 数量 1500、単価 1、10% | 行金額 `divFloor(1500,1000)=1`、税 0、合計 1 |
| T11 | 10000 と、単価 -500、どちらも数量 1000、10% | 課税標準 9500、税 950、合計 10450 |
| T12 | 税抜 1、10% | 税 0、合計 1 |
| T13 | 行 0 | バケットなし、合計 0。発行ゲートは別テストで拒否 |
| T14 | 単価 -101、数量 1000、10% | 課税標準 -101、税 **-11**（ゼロ方向の -10 は不正）、合計 -112 |
| T15 | 税抜 1234567、10% | 税 123456、合計 1358023。浮動小数を経由しない |
| T16 | 8% の行が無い | 8% バケットを返さない |

T04 と T05 と T14 が、この関数の存在理由である。

### 8.2 レイアウトモデル1

入力は行の `visualLength` と備考の `visualLength`。期待は段階または `refuse`。

| ID | 入力 | 期待 |
| --- | --- | --- |
| L01 | 1行、幅 10、備考 0 | comfortable |
| L02 | 8行、幅 20、備考幅 80 | comfortable |
| L03 | 18行、幅 10、備考 0 | comfortable |
| L04 | 19行、幅 10、備考 0 | compact |
| L05 | 23行、幅 10、備考 0 | compact |
| L06 | 24行、幅 10、備考 0 | dense |
| L07 | 29行、幅 10、備考 0 | dense |
| L08 | 30行、幅 10、備考 0 | emergency |
| L09 | 35行、幅 10、備考 0 | emergency |
| L10 | 36行、幅 10、備考 0 | refuse |
| L11 | 8行、幅 80、備考 0 | comfortable |
| L12 | 9行、幅 80、備考 0 | compact |
| L13 | 0行、備考 0 | comfortable（プレビュー用。発行はゲートが拒否） |

追加の不変条件:

- 同じ備考で行を足すと、段階は comfortable → compact → dense → emergency → refuse の方向にしか動かない
- `refuse` 以外は `usedTenth * 103 <= 273000`
- モデル1の定数オブジェクトをテストが import し、ヘッダ 240 等が変わっていたら失敗する

HTML 生成のテストは画素ではなく文字列。

- `kind=quote` の HTML は「見積書」を含み「適格請求書」を含まない
- `kind=invoice` かつ登録番号ありは、その `T`+13桁を含む
- 登録番号空の請求は `T` に続く13桁を含まない
- 軽減行があるとき「軽減税率（8%）」を含む
- 埋め込んだ font-size は、渡した段階の pt だけである

### 8.3 登録番号と日付と採番

- 空は有効
- `t` + 全角数字13 + 空白は、正規化後に `T` + 半角13桁
- 12桁と 14桁は拒否
- 検査数字が合わない `T0000000000000` も形式が合えば有効
- `2026-01-31` の翌月末は `2026-02-28`
- `2024-01-31` の翌月末は `2024-02-29`
- `2026-12-15` の翌月末は `2027-01-31`
- 採番は発行年が変わると 1 から。ロールバックのテストで `last_value` が進まない

### 8.4 バックアップとマイグレーション

| ID | 内容 | 期待 |
| --- | --- | --- |
| B01 | 往復 | 書類件数と発行済みの合計円が一致 |
| B02 | sqlite を1バイト反転 | 拒否。本番の件数とハッシュが変わらない |
| B03 | manifest のハッシュだけ改変 | 拒否 |
| B04 | `formatVersion=2` | 拒否 |
| B05 | 展開できない ZIP | 拒否 |
| B06 | 復元の手順5を失敗させる | 本番パスが置換されていない |
| B07 | 手順7で `integrity_check` を失敗させる | `swapped-out` が戻る |
| B08 | journal 最新ファイルを欠く | 1つ前が選ばれる |
| B09 | 検証済み daily を31個目まで書く | 最古の daily だけが消え、LKG は残る |
| M01 | 空ファイルに 001 | `user_version=1`、`issuer_profile` が1行、外部キー ON、WAL |
| M02 | SQL と `.sha256` を不一致にする | 適用しない |

ファイル操作は一時ディレクトリで行う。実機のファイルアプリは §8.5。

### 8.5 リリース前の実機確認

CI が代替できないものだけを、出荷チェックリストにする。

- iPhone のファイルアプリに Backups が見える（共有フラグ）。
- ユーザー選択フォルダへ書いた `.invbak` が、アプリ削除後も残り、再インストールから復元できる。
- Android で SAF の許可がプロセス再起動後も生きている。死んでいたらチップが赤になる。
- モデル1の L03（18行、comfortable）と L09（35行、emergency）と L10（36行、拒否）を実機 PDF で見る。18行と35行は1ページ、36行は PDF が生成されていない。
- 発行直後にプロセスを殺し、再起動してその請求が「ある」か「無い」かのどちらかであり、番号だけの中途半端な行が残っていない。

---

## 9. リスク

| リスク | 深刻度 | 扱い |
| --- | --- | --- |
| モデル1が実機 WebView より楽観的で、2ページになる | 高 | 安全係数 1.03、同梱フォント、フォールバック無し、クリップ無し。実機 L03/L09 を出荷条件にする。外れたら定数を直さずモデル2を足す |
| ユーザーフォルダの bookmark / SAF URI が失効する | 高 | 起動時に書いてみて失敗なら赤チップ。LKG と Documents のコピーは続行 |
| バックアップを iCloud に置き、部分ファイルを復元する | 高 | 本線にしない。警告。ハッシュ不一致は拒否し、1つ前の検証済みを選ぶ |
| 復元時に古い `-wal` が新しい DB を巻き戻す | 高 | チェックポイント後に本体だけコピー。置換時にサイドカーを消す。B07 |
| アプリ削除で Documents と LKG が消える | 高 | 初回に外部フォルダを勧める。未設定なら赤チップを消さない |
| 発行後に「1文字直したい」 | 高 | ボタンを置かない。複製して新しい番号。無効は印だけ |
| 36行以上の仕事が発行できない | 中 | 拒否文で行を減らすよう案内する。自動分割は税額を変えるのでしない |
| 対象外に非課税と不課税をまとめた | 中 | 画面ラベルとヘルプで区分しないと書く。区分が必要になったら列追加で新しいカテゴリを足し、既存行は書き換えない |
| 源泉が自動計算されない | 中 | 備考に手書き。誤った 10.21% 単一式は出さない |
| フォントサブセットに無い漢字 | 中 | 入力拒否。豆腐のまま PDF に出さない |
| 再生成 PDF のバイト列が発行時と違う | 中 | 数値はスナップショット。画面に不一致を出す。ハッシュを「合ったこと」に書き換えない |
| 平文バックアップが共有フォルダに並ぶ | 中 | 設定に「平文です。共有フォルダに置かないでください」と書く。暗号化はしない |
| ストレージ満杯で日次が失敗する | 中 | 発行は成功のまま、チップを赤にする。発行をロールバックして番号を曖昧にしない |
| ソロがモデル1の定数を「ちょっと」直す | 中 | テストが定数のリテラルを持つ。出荷済み版のファイルは編集しない規約 |

---

## 10. 却下した代替案

| 案 | 却下理由 |
| --- | --- |
| JSON をバックアップ正本にする | 復元が再 INSERT になり、書き込み中の整合を SQLite に任せられない |
| SQLite の生ファイルを、チェックポイントなしでコピーする | WAL の取りこぼしと、復元先へのサイドカー混入 |
| バックアップを暗号化する | パスワード忘れが全消失になる。売りと逆 |
| iCloud を日次の本線にする | 競合と同じ復元失敗を引き受ける |
| 毎日1ファイルだけ残し、世代を持たない | 壊れた今日が、健全な昨日を上書きする |
| 復元時にマージする | 単一正本で衝突解決不能。置換のみ |
| バックグラウンドだけで日次を取る | OS が止めた日が成功に見える |
| WebView の scrollHeight で段階を選ぶ | テストと本番が別の判定器になる |
| システムフォント | 折返しが端末で変わり、モデルが嘘になる |
| `overflow: hidden` で1枚に見せる | 合計や振込先が欠けた PDF を送れる |
| 溢れたら自動で2請求に割る | 税率ごとの端数が、1枚のときと一致しなくなる |
| 行ごとに消費税を出して足す | 適格請求書の税額として記載できない。T04 が 10 円になり、仕様の 11 円とずれる |
| `number` の小数と `REAL` 数量 | `0.08` が二進で閉じない。ゴールデンが環境で揺れる |
| 税込と税抜の両対応、端数3方式 | テストと問い合わせが掛け算になる。v1 の値は税抜と切捨て |
| 端数を設定で選べるようにする | 同じ理由。列は `'floor'` 固定で残し、UI は作らない |
| 発行後も同じ行を編集する | 送った PDF と台帳と、次のバックアップが別物になる |
| 修正インボイスと返還請求書を v1 に入れる | 正しい型だが、種別と採番と PDF が同時に増え、ソロが核（保全、税、1枚）を落として出荷する |
| 無効化で行を消す | 写しが消える。印だけにする |
| 見積行の kind を invoice に UPDATE する | 見積が台帳から消える |
| 源泉 10.21% の単一式 | 100万円超の税率が違う額を、請求額として印刷する |
| 登録番号の検査数字を全員に適用する | 個人事業主を偽のエラーで止める |
| 番号の手入力と、下書き時点の番号確保 | 再利用と、破棄による欠番埋めが起きる |
| UUID 主キー | 単一端末では整数で足り、バックアップの目視が難しくなる |
| アプリ内課金 | 復元購入とレシートが本体より重い。ストアの買い切りで足りる |
| ORM | 5〜11 テーブルの SQL を隠す利益より、発行凍結のレビューコストが大きい |
| PDF を ZIP と DB BLOB の両方に30世代置く | 容量が保全の障害になる。数値と段階を SQLite に残し、PDF は再生成する |
| Chromium で PDF ページ数を CI する | `expo-print` の保証にならない |
| 20行で一律拒否、または 7pt 未満まで縮める | 前者は通常の明細を落としすぎ、後者は読めない請求書を送る |

---

## 11. 受け入れ基準

次が自動テストまたは §8.5 の実機手順で示せるまで、v1 完成としない。

1. T01〜T16 と L01〜L13 と B01〜B09 と M01〜M02 が CI で固定値一致する。
2. 発行済みの取引先マスタを改名しても、詳細と再生成 PDF の宛名が発行時のままである。
3. 見積を請求にコピーし、明細を変えずに発行すると、税率別の円が元の見積と一致する。元の見積は `issued` のまま残る。
4. 36行の短い明細は PDF が生成されない。18行と35行の実機 PDF は1ページである。
5. バックアップを1バイト壊すと復元が拒否され、本番のハッシュが変わらない。
6. 復元の途中失敗で、失敗前の件数が残る。
7. アプリ削除後、ユーザーが選んだフォルダの `.invbak` から、発行済み件数と合計円が戻る。
8. 登録番号が空の請求 PDF に、登録番号行が無い。形式を満たす番号は PDF にそのまま出る。
9. バックアップ先未設定でも発行でき、ホームの赤チップは消えない。
10. アプリ内課金の依存が `package.json` に無い。
