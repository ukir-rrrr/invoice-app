# 適格請求書アプリ 設計書

- 対象: Expo (React Native / TypeScript / expo-router) の iOS / Android オフライン請求・見積アプリ
- 視点: **適格請求書（インボイス制度）と消費税計算の正しさ**。見た目、入力手数、暗号化の派手さより、交付した書類が法令上の記載事項を満たし、端数が「税率ごとに1回」であり、発行済み写しが7年後も復元できることを最優先する。
- 価格想定: 買い切り 980〜1,500円
- 本書は設計のみ。アプリ実装コードは含まない。

---

## 1. 結論（先に固定する判断）

1. 金額はすべて**整数円**。中間計算も IEEE 754 の `number` で金銭を持たない。
2. 消費税額等は**一の書類につき税率ごとに1回だけ**端数処理する。明細行ごとの税額端数は実装しないし、UIにも出さない。
3. 発行済みの適格請求書・適格返還請求書・修正インボイスは**更新も削除もしない**。誤りは修正インボイス、値引き・返品は適格返還請求書で後続書類を足す。
4. 見積書は適格請求書ではない。見積の税表示は参考値であり、請求書化の時点で発行者設定・取引先・税率を**再スナップショット**する。
5. 登録番号はオフラインでは `T` + 数字13桁の正規化と形式検査のみ。法人番号のチェックデジットを個人事業主番号に適用して弾くことは禁止。形式を満たさない番号では**適格請求書として発行できない**。
6. PDF は常に **A4 1枚**。収まらなければ発行を拒否する。2ページに黙って送る実装は欠陥とする。
7. バックアップの主戦場は iCloud ではない。日次で端末の Files / 共有ストレージへ、改ざん検知付きアーカイブを書き、リストアは「検証 → 一時DB → 入替」の順だけを許す。

競合の主訴（突然の全消失、iCloud 復元失敗、A4 からはみ出すレイアウト）は、いずれも「正しさ」と「写しの保存」を軽視した設計の帰結だとみる。本アプリの売りは機能数ではなく、**消えないことと、交付してよい書類だけを交付すること**である。

---

## 2. プロダクト定義

### 2.1 誰のための何物か

日本のフリーランス・個人事業主・小規模事業者向け。売手として適格請求書を交付し、その写しを自分の端末に残す。サーバは持たない。データは端末内 SQLite と、ユーザーが触れるバックアップファイルにだけ存在する。

### 2.2 v1 の範囲

| 番号 | 機能 | 必須の正しさ |
| --- | --- | --- |
| 1 | 請求書・見積書 PDF。行が増えても A4 1枚に収める | はみ出し禁止。最低可読サイズを下回ったら発行拒否 |
| 2 | 取引先・品目の登録 | 品目は税率区分を必須で持つ |
| 3 | 見積・請求の作成。登録番号、10% / 8%、税率別合計、端数、見積→請求 | 発行時スナップショット。見積と請求の法的地位を混ぜない |
| 4 | 日次自動バックアップ（iOS Files / Android ストレージ）、ワンタップ復元、完全性検証 | 壊れたバックアップで現行DBを上書きしない |

v1 で**同時に入れる**もの（後回しにすると発行済み不変が運用不能になるため）:

- 適格返還請求書（値引き・返品・キャンセル）
- 修正インボイス（記載誤り。方式は「全記載事項の再掲 + 元番号参照」）
- 発行者（自分）プロフィール、振込先、端数方法、税込/税抜の固定
- 買い切り IAP と「購入の復元」

### 2.3 v1 でやらないこと

- サーバ同期、アカウント、複数端末リアルタイム共有
- 仕入側の受領インボイス管理、経費、確定申告出力
- 適格簡易請求書（小売レシート型）。本アプリは B2B の宛先あり請求に限定する
- 複数発行者（複数屋号を同一DBで同時運用）
- 外貨、円未満、インボイス制度以前の経過措置の自動判定
- 国税庁公表サイト Web-API への必須依存（オフライン発行を壊すため。オンライン時の任意照合は v1.1）
- 電子帳簿保存法の「真実性・可視性」フル対応（タイムスタンプ事業者、検索要件のクラウド保存）。v1 は消費税の交付・写しに集中する
- 2ページ請求、明細の別紙、写真付き請求

---

## 3. 法令上の不変条件

実装都合で緩めない。UI が面倒でも、ここを壊す機能は入れない。

### 3.1 適格請求書の記載事項（消法57条の4第1項）

交付する適格請求書 PDF と、発行済みスナップショット JSON の両方に、次を欠かさず残す。

1. 適格請求書発行事業者の氏名又は名称 **および登録番号**
2. 課税資産の譲渡等を行った年月日（継続取引は期間記載を許容）
3. 資産又は役務の内容。軽減対象なら**その旨**（行の `※` + 凡例で足りる）
4. 税抜価額または税込価額を**税率ごとに区分して合計した金額**および**適用税率**
5. **税率ごとに区分した消費税額等**
6. 交付を受ける事業者の氏名又は名称

不足した状態でステータスを `issued` にして PDF を「適格請求書」と名乗ることを禁止する。登録番号が無い・形式不正なら、見積は作れるが、書類種別 `invoice` の適格発行はブロックする。免税事業者向けの「請求書（適格請求書ではない）」は v1 では出さない。中途半端な書類を量産して取引先の仕入税額控除を落とす方が害が大きい。

### 3.2 端数処理（消令70条の10、基通1-8-15）

- 税率ごとに合計した対価の額に税率（税抜なら 10/100・8/100、税込なら 10/110・8/108）を乗じ、1円未満を処理する。
- **一の適格請求書につき税率ごとに1回**。
- 切上げ・切捨て・四捨五入は発行者が選べる。本アプリは発行者設定で1つ選び、**その書類に焼き付ける**。
- 明細ごとに税を出して合算した値を⑤として記載することは認められない。画面の行にも「消費税 12円」を出さない（出すとユーザーがそれを信頼し、PDF と不一致になる）。

### 3.3 登録番号

- 法人: `T` + 法人番号13桁
- 個人事業主等: `T` + 法人番号と重複しない13桁。マイナンバーは使わない
- オフライン検証は形式だけ。法人番号チェックデジット（基礎12桁から1〜9を算出）を全件に適用すると、個人事業主の正しい番号を偽陰性で落とす

### 3.4 見積書と請求書

見積書に登録番号を書いてはいけないわけではないが、見積は仕入税額控除の保存書類にならない。本アプリは見積 PDF の表題を必ず「見積書」とし、「適格請求書」と書かない。見積の税率別税額は参考表示であり、請求書化時に再計算する。

### 3.5 採番

法令は連番を要求しない。しかし写しの保存と修正参照では、人間が口頭で指せる一意番号が要る。本アプリは**発行時に採番**し、欠番は作ってよいが**再利用は禁止**する。下書きに正式番号を振らない（破棄した下書きが欠番を量産し、後で手入力で穴埋めしたくなるため）。

### 3.6 発行後の不変と写し

- 交付した適格請求書等の写しを保存する義務がある（原則7年）。
- 記載誤りは、当初の写しを残したまま修正インボイスを交付する（消法57条の4第4項・第5項）。当初を上書き削除してはならない。
- v1 の修正方式は、国税庁 Q&A 問33 の「改めて記載事項の全てを記載する」方式に固定する。差分だけ書く方式は、元PDFが欠けた瞬間に意味を失う。
- 値引き・返品・キャンセルは適格返還請求書。当初請求を「なかったこと」にしない。

### 3.7 日付の暦

課税時期の日付は `Asia/Tokyo` の暦日 `YYYY-MM-DD` で持つ。UTC の瞬間時刻を issue_date にしない。発行操作のタイムスタンプ `issued_at` だけは ISO-8601（オフセット付き）で監査用に残す。

---

## 4. ライブラリ選定

原則: Expo SDK の現行安定系に乗る。ネイティブモジュールを自分で増やさない。金銭とスキーマは自分で握る。

| 用途 | 採用 | 理由 |
| --- | --- | --- |
| 実行基盤 | Expo + TypeScript strict + expo-router | 提案スタックに従う。画面境界をファイルシステムで強制できる |
| DB | `expo-sqlite`（同期 API + WAL） | 端末内単一ファイル。SQL を隠さない。バックアップ対象が1ファイルで済む |
| ORM | **使わない** | 金額を `number` に、JSON を勝手に型変換されるのが危険。マイグレーションSQLをレビュー対象にしたい |
| 金額 | 自前 `Yen`（bigint 相当の整数、TypeScript では `Yen` branded `number` だが値は 2^53 未満の整数円に制限） | フリーランス請求で 9 兆円は出ない。中間の税率乗算は整数演算 |
| PDF | HTML テンプレート + `expo-print` | 日本語組版を CSS で制御しやすい。ネイティブ描画は行高さ計算が分裂する |
| 印刷前計測 | 自前 `layout.ts`（行数・文字量から高さ推定）。WebView 実測は補助 | 実測だけに頼ると端末差で「シミュレータでは1枚、実機で2枚」が起きる |
| 共有 | `expo-sharing` | OS の共有シートに PDF を渡すだけ。自前メールサーバを持たない |
| ファイル | `expo-file-system/next` + `expo-document-picker` | バックアップの書き出し・読み込み。iOS はアプリ Documents を Files に露出 |
| ハッシュ | `expo-crypto`（SHA-256） | 完全性検証。自前実装しない |
| 日付 | `Temporal` が使えるならそれ。なければ `date-fns` + 固定 TZ `Asia/Tokyo` | `Date` のローカルTZ依存を禁止 |
| バックグラウンド | `expo-background-task` を試す。**成功を前提にしない** | iOS は日次を保証しない。フォアグラウンド起動時の「20時間超なら即バックアップ」を本線にする |
| 購入 | `expo-iap`（または StoreKit / Play Billing を包む現行 Expo 向けライブラリ） | 買い切り + restore。サーバーレシート検証は持たない。端末に「unlock + 元レシート情報」を保存 |
| テスト | Jest + `jest-expo` + TypeScript。ゴールデンはプレーンオブジェクト | 税と layout は OS を起動せずに測る |

### 4.1 採用しないもの（この節の範囲）

- Drizzle / WatermelonDB / Realm: 同期モデルやマイグレーション抽象が、発行済み行の UPDATE 禁止をすり抜けやすい
- `react-native-html-to-pdf` 等の別系統: expo-print と描画結果が食い違う
- `decimal.js` を金額の正本にする: 依存を増やすより整数円の方がレビューしやすい。税率乗算は分母が 100 / 108 / 110 だけ
- iCloud KVS / CloudKit をバックアップ本線にする: 競合が既に失敗している場所

---

## 5. データ表現

### 5.1 金銭

```ts
type Yen = number & { readonly __yen: unique symbol };
type RateBps = 1000 | 800 | 0; // 10%, 8%, 対象外
type TaxCategory = "standard" | "reduced" | "non_taxable";
type TaxMode = "exclusive" | "inclusive";
type RoundingMode = "floor" | "ceil" | "half_up";
```

- 1円未満の税計算は「対価合計 × 分子 / 分母」を**整数除算の余り付き**で扱い、余りを rounding で処理する（§7.1）。
- 数量は 10^-3 の整数 `qtyMilli`。`1.5 時間` は `1500`。行金額は `half_up(qtyMilli * unitPriceYen / 1000)`。これは対価の行金額であり、消費税の端数ではない。
- 1書類の中で税抜行と税込行を混在させない。`documents.tax_mode` が全行の解釈を決める。

### 5.2 書類種別と状態

```
kind:   quote | invoice | credit_note | revised_invoice
status: draft | issued | voided_draft | superseded | converted
```

許可する遷移だけを関数で書く。SQL の `UPDATE documents SET ...` を画面から直接叩かない。

| 現在 | 操作 | 次 |
| --- | --- | --- |
| quote/draft | 発行（PDF化） | quote/issued（参考書類。適格ではない） |
| quote/issued | 請求書化 | quote/converted + invoice/draft（中身コピー） |
| invoice/draft | 適格発行 | invoice/issued（番号確定、hash、PDF、スナップショット凍結） |
| invoice/issued | 修正 | 元は issued のまま残し、revised_invoice/issued を新規。元に `superseded_by` を付けるが行は消さない |
| invoice/issued | 返還 | credit_note/issued を新規。元は issued のまま |
| */draft | 破棄 | 物理削除可。番号は未使用 |
| issued 系 | 編集・削除 | **禁止** |

`voided` を発行済みに対して使わない。発行済みを「無効」に見せると写しが消えたように運用される。キャンセルは返還請求書で金銭を打ち消す。

### 5.3 スナップショット

発行瞬間に次を JSON で `documents` に固定する。マスタを後から直しても発行済み PDF は変わらない。

- `issuer_snapshot`: 氏名/名称、住所、登録番号、端数方法、税モード
- `client_snapshot`: 名称、敬称、住所
- `bank_snapshot`: 当時の振込先
- `lines_snapshot`: 行の完全コピー（計算入力）
- `totals_snapshot`: 税率別対価、税率別税額、対象外、総合計
- `content_hash`: 上記の正規化 JSON（キーソート、空白なし）の SHA-256

PDF 再生成が必要になっても、入力はスナップショットだけを見る。再生成結果のハッシュが変わったらバグであり、発行済みファイルは旧 PDF を優先して残す。

### 5.4 見積 → 請求

コピーするのは行の「今のマスタ参照」ではなく、見積発行時スナップショットを初期値にした**新しい draft**。請求の発行前に単価・税率を変えてよい。変えたら見積と不一致になるのは正常。UI は「見積番号 Q-2026-0003 を基に作成。金額は再計算されます」と明示する。見積の参考税額を請求の⑤に流用しない。

---

## 6. SQL スキーマとマイグレーション

### 6.1 方針

- ファイル: `app.sqlite`。`PRAGMA journal_mode=WAL;` `PRAGMA foreign_keys=ON;` `PRAGMA synchronous=FULL;`
- バージョンは `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
- マイグレーションは `src/db/migrations/0001_init.sql` から始まる番号付き SQL。アプリは未適用をトランザクションで順適用
- **適用前に必ず** 現行 DB を `pre_migrate_<version>_<timestamp>.qinvbak` としてバックアップする。失敗したら接続を閉じ、バックアップから戻して起動を中止する
- 発行済み行を書き換えるマイグレーションは禁止。列追加は NULL 許容または DEFAULT のみ

### 6.2 0001_init.sql（v1 正本）

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA synchronous=FULL;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- 自分（発行者）は1行だけ
CREATE TABLE issuer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  registration_number TEXT,              -- 正規化済み T+13 or NULL
  logo_path TEXT,
  stamp_path TEXT,
  tax_mode TEXT NOT NULL DEFAULT 'exclusive'
    CHECK (tax_mode IN ('exclusive', 'inclusive')),
  rounding_mode TEXT NOT NULL DEFAULT 'floor'
    CHECK (rounding_mode IN ('floor', 'ceil', 'half_up')),
  default_due_days INTEGER NOT NULL DEFAULT 30
    CHECK (default_due_days BETWEEN 0 AND 365),
  default_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ordinary', 'current')),
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  honorific TEXT NOT NULL DEFAULT '御中' CHECK (honorific IN ('御中', '様')),
  postal_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '式',
  unit_price_yen INTEGER NOT NULL CHECK (unit_price_yen >= 0),
  tax_category TEXT NOT NULL
    CHECK (tax_category IN ('standard', 'reduced', 'non_taxable')),
  note TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 採番器。kind+year で分離。last_value は単調増加のみ
CREATE TABLE number_sequences (
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'invoice', 'credit_note', 'revised_invoice')),
  year INTEGER NOT NULL CHECK (year BETWEEN 2023 AND 2100),
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (kind, year)
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'invoice', 'credit_note', 'revised_invoice')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'superseded', 'converted')),
  number TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  issue_date TEXT,                       -- YYYY-MM-DD
  due_date TEXT,
  service_date TEXT,                     -- 課税資産の譲渡等の日。期間なら下2列
  service_period_start TEXT,
  service_period_end TEXT,
  client_id INTEGER REFERENCES clients(id),
  source_quote_id INTEGER REFERENCES documents(id),
  revises_id INTEGER REFERENCES documents(id),
  refunds_id INTEGER REFERENCES documents(id),
  superseded_by INTEGER REFERENCES documents(id),
  tax_mode TEXT NOT NULL CHECK (tax_mode IN ('exclusive', 'inclusive')),
  rounding_mode TEXT NOT NULL CHECK (rounding_mode IN ('floor', 'ceil', 'half_up')),
  registration_number TEXT,
  -- 凍結合計（下書きは毎回再計算して書く。発行後は不変）
  base_std_yen INTEGER NOT NULL DEFAULT 0,
  tax_std_yen INTEGER NOT NULL DEFAULT 0,
  base_red_yen INTEGER NOT NULL DEFAULT 0,
  tax_red_yen INTEGER NOT NULL DEFAULT 0,
  non_taxable_yen INTEGER NOT NULL DEFAULT 0,
  total_yen INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  issuer_snapshot_json TEXT,
  client_snapshot_json TEXT,
  bank_snapshot_json TEXT,
  lines_snapshot_json TEXT,
  totals_snapshot_json TEXT,
  content_hash TEXT,
  pdf_relpath TEXT,
  issued_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'draft' AND number IS NULL AND content_hash IS NULL)
    OR (status IN ('issued', 'superseded', 'converted') AND number IS NOT NULL)
  ),
  CHECK (
    (kind <> 'invoice')
    OR (status = 'draft')
    OR (registration_number IS NOT NULL)
  )
);

CREATE TABLE document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  qty_milli INTEGER NOT NULL CHECK (qty_milli > 0),
  unit TEXT NOT NULL,
  unit_price_yen INTEGER NOT NULL CHECK (unit_price_yen >= 0),
  amount_yen INTEGER NOT NULL CHECK (amount_yen >= 0),
  tax_category TEXT NOT NULL
    CHECK (tax_category IN ('standard', 'reduced', 'non_taxable')),
  UNIQUE (document_id, sort_order)
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  relpath TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  document_count INTEGER NOT NULL,
  issued_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('daily', 'manual', 'pre_migrate', 'pre_restore')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_documents_kind_status ON documents(kind, status);
CREATE INDEX idx_documents_issue_date ON documents(issue_date);
CREATE INDEX idx_documents_client ON documents(client_id);
CREATE INDEX idx_lines_document ON document_lines(document_id);
```

発行済みの不変は CHECK だけでは足りない。リポジトリ層で `assertDraft(id)` を全 UPDATE/DELETE の先頭に置く。発行後に `document_lines` を触る API を公開しない（参照は `lines_snapshot_json`）。

### 6.3 以降のマイグレーション例（予約）

- `0002_issued_pdf_blob.sql` — 外部 PDF が消えた場合に備え、発行済み PDF を `issued_pdfs(document_id, bytes)` に複製する。v1 初回リリースに間に合わなければ 0001 時点で `pdf_relpath` のみとし、0002 を最初の追加マイグレーションにする。**推奨は v1 から BLOB も持つ**。パスだけは Files 整理で消える。
- `0003_registration_last_checked.sql` — 任意の公表サイト照合結果キャッシュ。オフライン発行の条件にはしない。

v1 出荷時点の目標は `0001` + 可能なら `0002`。発行済みデータを変換する 0003 以降は「列追加のみ」。

### 6.4 起動シーケンス

1. アプリ Documents に `app.sqlite` が無ければ空ファイル作成 → 0001 適用 → `issuer` はまだ作らない（オンボーディングで INSERT）
2. あれば `PRAGMA integrity_check`。失敗なら自動で最新 verified バックアップの復元を提案し、黙って空DBを作らない
3. `schema_migrations` を読み、未適用があれば pre_migrate バックアップ → 適用
4. アプリ不変条件の自己診断: 発行済みなのに hash 無し、invoice/issued なのに登録番号無し、税率別合計と行の再計算不一致

---

## 7. 主要アルゴリズム

### 7.1 消費税と端数

入力は「同一 `tax_mode` の行配列」と `rounding_mode`。出力は税率別の対価・税額と総合計。これ以外の経路で合計を出さない。

```
rateOf(category):
  standard    -> 分子 10 / 分母 100 （税込なら 10 / 110）
  reduced     -> 分子  8 / 分母 100 （税込なら  8 / 108）
  non_taxable -> 税額 0。対価は合算しない（non_taxable_yen に載せる）

base[c] = sum(amount_yen of lines where tax_category = c)

taxYen(base, num, den, mode):
  // 整数のみ。q = floor(base * num / den), r = (base * num) % den
  q, r = divmod(base * num, den)
  if r == 0: return q
  switch mode:
    floor   -> q
    ceil    -> q + 1
    half_up -> (r * 2 >= den) ? q + 1 : q

totals:
  tax_std = taxYen(base.standard, ...)
  tax_red = taxYen(base.reduced, ...)
  if exclusive:
    total = base.standard + tax_std + base.reduced + tax_red + non_taxable
  if inclusive:
    // base は税込合計。税額は内税
    total = base.standard + base.reduced + non_taxable
    // PDF ④には税込合計と適用税率、⑤に税額。税抜の参考値は (base - tax) を出してよいが⑤の代替にはしない
```

禁止:

- 行ごとに `taxYen(line.amount)` して `sum`
- 10% と 8% を足してから丸める
- 画面は切り捨て、PDF は四捨五入、のような経路分裂
- `Math.round(base * 0.1)`（`0.1` が二進で表現しきれない）

四捨五入の定義は「余り × 2 >= 分母なら切り上げ」。0.5円ちょうどは常に上方向。銀行家丸め（even）は使わない。日本の請求実務とユーザー予測が一致しない。

発行者の `rounding_mode` 初期値は **floor（切捨て）**。取引先に不利な切上げをデフォルトにしない。一度発行した書類の rounding は発行者設定を後から変えても動かない。

### 7.2 登録番号の正規化と検証

```
normalize(raw):
  NFKC
  空白・全角スペース削除
  全角英数を半角へ
  先頭の半角/全角 t を T へ

validateFormat(s):
  /^T[0-9]{13}$/

validateCorporateCheckDigit(digits13):
  // 法人番号用。個人事業主には使わない
  // 基礎12桁（右）から公式の奇数桁和+偶数桁和×2、9-mod
  // UI の「法人として検査」トグルが ON のときだけ警告に使う
```

発行ゲート:

- `kind === 'invoice' | 'credit_note' | 'revised_invoice'` かつ適格として出す → `validateFormat` 必須
- 不一致ならエラーコード `REGISTRATION_NUMBER_INVALID`。推測補正で発行しない（`T` 抜けを勝手に足して発行すると、別人格の番号になり得る）

### 7.3 採番

```
format:
  見積     Q-YYYY-0001
  請求     I-YYYY-0001
  返還     C-YYYY-0001
  修正     R-YYYY-0001

assignNumber(kind, issueDate):
  year = 暦年(issueDate, Asia/Tokyo)
  BEGIN IMMEDIATE;
    last = SELECT last_value FROM number_sequences WHERE kind=? AND year=?
    if none: INSERT (kind, year, 0); last = 0
    next = last + 1
    UPDATE last_value = next
    番号文字列を documents.number に UNIQUE 挿入
  COMMIT
```

- 発行トランザクション内で採番する。採番成功・PDF 失敗なら、番号は消費したまま書類は issued とし、PDF は再試行する（番号を巻き戻すと二重交付事故が起きる）。
- ユーザーによる番号手入力は v1 で提供しない。

### 7.4 発行（不変の作り方）

1. draft を読む。行が1件以上あること
2. レイアウト計測。`fits === false` なら発行中止（`LAYOUT_OVERFLOW`）
3. 税再計算。画面表示中の合計と一致しなければ中止（実装バグ）
4. 適格書類なら登録番号・取引先名称・取引日または期間・税率別④⑤を検証
5. `BEGIN IMMEDIATE`
6. スナップショット JSON 作成 → hash
7. 採番
8. `status='issued'`, 合計列、hash、issued_at を書く
9. PDF を `issued/<number>.pdf` と SQLite BLOB に書く
10. `COMMIT`
11. 日次を待たず **即時バックアップ**（発行はバックアップより稀で、消えてはいけないイベント）

発行後の UPDATE 許可列は `superseded_by` だけ（修正インボイス発行時）。本文・行・合計・hash・PDF は更新しない。

### 7.5 A4 1枚保証

物理:

- A4 = 210mm × 297mm
- 余白上下左右 12mm
- 可印字高さ 273mm。`expo-print` は 72pt/inch 換算で高さ 773pt 程度を予算とする

レイアウト予算（固定部は縮めない）:

| 領域 | 最大高さ |
| --- | --- |
| 表題 + 番号 + 登録番号 | 28mm |
| 発行者・取引先ブロック | 32mm |
| 日付・支払期限・期間 | 14mm |
| 税率別集計 + 総合計 | 32mm |
| 振込先 + 注記 | 28mm |
| フッター（「これは適格請求書です」等） | 8mm |
| **明細に残す** | **約 131mm** |

可変は明細だけ。アルゴリズム:

```
MIN_FONT_PT = 7
MAX_FONT_PT = 10.5
MIN_ROW_MM = 5.2

measure(lines, fontPt):
  各行: 品名の全角換算幅 / 列幅 から折り返し行数
  height = Σ (max(1, wrap) * lineHeight(fontPt)) + ヘッダ行

fit(lines):
  font = MAX
  while measure(lines, font) > BUDGET and font > MIN:
    font -= 0.25
  if measure(lines, font) > BUDGET:
    return { fits: false, reason: 'LAYOUT_OVERFLOW', maxLinesHint }
  return { fits: true, fontPt: font }
```

意見:

- 自動で 2 枚目に送らない。競合の苦情そのものだから。
- 自動で「続きは別請求書」に分割しない。税率ごとの端数は**書類単位**なので、勝手に分割すると税額合計が変わる。
- 収まらないときは「行を減らすか、品名を短くしてください（現在 N 行、この用紙では最大 M 行相当）」と返す。
- 最低 7pt 未満にはしない。読めない適格請求書は記載したことにならない。
- 軽減行があるときは表の右に `※`、集計の下に「※は軽減税率対象（8%）」。この凡例高さは固定部に含める。
- HTML は計測結果の `fontPt` / `rowPad` をインラインスタイルで固定してから `expo-print` する。CSS の `font-size: clamp()` やブラウザ任せの改ページは使わない。

目安: 標準的な品名（全角 20 字以内、折り返しなし）で **18〜22 行**が上限。それを超える仕事は請求を分ける（ユーザーが明示的に2枚の適格請求書を出す）。その場合、端数はそれぞれ1回ずつであり、合計税額が1枚にまとめた場合と食い違い得る。画面で警告する。

### 7.6 バックアップとリストア

#### コンテナ `.qinvbak`

ZIP（無圧縮でも可）:

```
manifest.json
app.sqlite
issued_pdfs/I-2026-0001.pdf
SHA256SUMS
```

`manifest.json`:

```json
{
  "magic": "qinvbak-v1",
  "schema_version": 1,
  "app_version": "1.0.0",
  "created_at": "2026-10-12T14:00:00+09:00",
  "tz": "Asia/Tokyo",
  "counts": {
    "documents": 12,
    "issued": 8,
    "clients": 4,
    "items": 7
  },
  "sqlite_sha256": "...",
  "files": [{ "path": "app.sqlite", "sha256": "...", "bytes": 0 }]
}
```

`SHA256SUMS` は各ファイルのハッシュ。`manifest.sqlite_sha256` と一致必須。署名鍵は持たない（オフライン、秘密鍵の喪失＝データ喪失になるため）。完全性はハッシュ照合と SQLite `integrity_check` で見る。機密性より復元可能性を取る。

#### 日次バックアップ

- 保存先（固定）:
  - iOS: アプリ Documents を Files に公開（`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`）。ユーザーが「この iPhone内 > 本アプリ」を iCloud Drive に手で置くのは自由だが、**アプリは iCloud を本線にしない**
  - Android: アプリ専用ディレクトリに加え、ユーザーが選んだフォルダへ SAF で複製。未選択なら専用ディレクトリのみ（アンインストールで消える旨をオンボーディングで赤字表示し、フォルダ選択を完了するまで「保護未完了」バッジを出す）
- 保持: 検証済みを最大 30 世代。31 個目を書く前に最古の verified daily を消す。`pre_migrate` / `pre_restore` は世代カウント外で直近 5 個
- トリガ: (a) フォアグラウンドかつ前回成功から 20 時間以上 (b) バックグラウンドタスクが走ったとき (c) 発行直後 (d) 手動
- 手順: WAL を checkpoint → SQLite を一時ファイルに backup API でコピー → PDF を同梱 → ハッシュ → ZIP を `*.tmp` に書く → `fsync` 相当の後にリネーム → `backups` 行を verified=1 で挿入。リネーム前に落ちたら tmp を次回起動で捨てる

#### リストア

1. ユーザーが `.qinvbak` を選ぶ
2. ZIP 展開は一時ディレクトリのみ
3. magic / schema_version（アプリが知っている最大以下）/ SHA256SUMS / manifest 一致
4. 一時 `app.sqlite` を開いて `PRAGMA integrity_check` = `ok`
5. アプリ不変条件（§6.4-4）
6. **現行 DB を pre_restore バックアップ**（ここが欠けると復元失敗が即死になる）
7. 接続を閉じ、現行ファイルを退避、新ファイルを所定位置へリネーム、再オープン
8. 失敗したら退避を戻す。成功したら退避は保持（1世代）
9. 発行済み PDF が ZIP 内にあれば上書き配置。欠けていても DB スナップショットがあれば書類は生きている。PDF は再生成できるが、再生成ハッシュが変わった場合は「再生成PDF（原本とビット不一致）」と印を付け、原本バイトが無い事実を記録する

壊れたバックアップを「一部だけ戻せた」と適用しない。部分適用は合計と行がずれ、適格請求書の写しとして最悪の状態になる。全部成功か、全部やめるか。

---

## 8. 画面フロー

オンボーディング以外、下タブは4つ: 書類 / 取引先 / 品目 / 設定。

```
初回
  発行者名 → 登録番号（形式検査）→ 税抜/税込 → 端数 → 振込先
  → Android ならバックアップフォルダ選択
  → （任意）買い切りアンロック。未購入でも下書きは作れるが発行と PDF 共有はロック

書類タブ
  フィルタ: 種別 / 年 / 状態
  [見積を作る] [請求を作る]
  行タップ → 詳細
    draft: 編集 / プレビュー / 発行 / 破棄
    issued quote: プレビュー / 請求書にする / 共有
    issued invoice: プレビュー / 共有 / 修正インボイス / 返還請求書
    ※ 発行済みに「編集」を置かない

書類編集（draft のみ）
  取引先（必須） / 取引日または期間 / 支払期限
  行: 品目マスタから挿入、または都度入力。税率区分は行ごとに必須
  下部の税率別内訳は domain/tax の戻り値だけを表示
  プレビュー: 実寸 A4 相当。収まらないときは発行ボタンを disable

取引先・品目
  一覧 / 作成 / 編集 / アーカイブ
  品目作成時に standard/reduced/non_taxable を選ばせず保存できない
  発行済み書類が参照していてもマスタ編集は可（スナップショットが正本）

設定
  発行者 / 税と端数 / 振込先 / バックアップと復元 / 購入の復元
  税と端数の変更は「これから作る下書きと新規書類に適用。発行済みは変わらない」

復元
  設定 → バックアップ一覧、または OS のファイル選択
  検証結果（件数、発行済み件数、日付、hash）を見せてから実行
```

発行ボタンのコピーは「送信」ではなく「発行する（以降この内容は変えられません）」。一度の確認モーダルで番号が確定することを書く。

---

## 9. モジュール構成

```
app/                          expo-router
  (onboarding)/
  (tabs)/index.tsx            書類
  (tabs)/clients.tsx
  (tabs)/items.tsx
  (tabs)/settings.tsx
  documents/new.tsx
  documents/[id].tsx
  documents/[id]/preview.tsx
  restore.tsx

src/domain/                   純関数。RN も SQLite も import しない
  money.ts                    Yen, qtyMilli, 行金額
  tax.ts                      税率別集計と端数。唯一の合計関数
  registrationNumber.ts
  documentNumber.ts           フォーマットのみ。採番の副作用は repo
  issueGate.ts                記載事項チェック、LAYOUT は引数で受け取る
  transitions.ts              状態遷移表
  snapshot.ts                 正規化 JSON と hash 対象の並べ方

src/db/
  client.ts                   オープン、PRAGMA、integrity_check
  migrate.ts
  migrations/0001_init.sql
  repos/issuer.ts
  repos/clients.ts
  repos/items.ts
  repos/documents.ts          draft 更新と issue トランザクション
  repos/sequences.ts
  repos/backups.ts

src/pdf/
  template.ts                 HTML 文字列。計測済み fontPt を埋め込む
  layout.ts                   measure / fit
  render.ts                   expo-print 呼び出し

src/backup/
  pack.ts
  unpack.ts
  integrity.ts
  scheduler.ts

src/iap/
  unlock.ts

src/ui/                       表示部品。税計算を再実装しない
```

依存方向: `app` → `ui` / `db` / `pdf` / `backup` / `iap` → `domain`。`domain` は葉。税計算を `documents.ts` と `template.ts` にコピーしない。

---

## 10. テスト戦略

CI は Jest のみで v1 の品質を担保する。端末 E2E は発行フローのスモークに限り、税の正否を E2E に預けない。

### 10.1 税のゴールデン（必須）

ファイル: `src/domain/tax.golden.test.ts`。入力と期待値を表で持つ。実装を変えても期待値は法令ケースとして残す。

| ID | モード | 端数 | 行（amount, category） | 期待 |
| --- | --- | --- | --- | --- |
| G1 | exclusive | floor | 15 standard, 15 standard | base_std=30, tax_std=3, total=33 |
| G2 | exclusive | floor | 同 G1 を行ごと floor すると 1+1=2。**2 を期待値にしてはならない** | 上に同じ |
| G3 | inclusive | floor | 108 standard, 108 standard | 税込 base=216, tax=floor(2160/110)=19 |
| G4 | exclusive | floor | 1000 standard + 800 reduced | tax_std=100, tax_red=64。合算丸め禁止 |
| G5 | exclusive | ceil | 1 standard | tax=1 |
| G6 | exclusive | half_up | 15 standard | tax=2（1.5 → 2） |
| G7 | exclusive | half_up | 5 standard | tax=1（0.5 → 1） |
| G8 | exclusive | floor | 0件の standard + 500 reduced | tax_std=0（行がない税率は 0。4% などを作らない） |
| G9 | exclusive | floor | 200 non_taxable + 100 standard | non_taxable=200, tax_std=10, total=310 |
| G10 | exclusive | floor | qty 1.5 × 単価 1000 → amount 1500 standard | tax=150 |
| G11 | exclusive | floor | 空行 | 発行ゲートで落ちる。tax 関数はゼロ合計を返す |
| G12 | inclusive | ceil | 110 standard | tax=ceil(1100/110)=10 |

G1/G2/G3 が本アプリの存在理由である。行ごと端数の方が「電卓と合う」とレビューで戻されても、期待値を stooge しない。

追加ユニット:

- `registrationNumber`: 全角 `Ｔ１２...`、空白入り、`t` 小文字、12桁、14桁、チェックデジット偽陰性にしないこと
- `transitions`: issued の編集が例外になること
- `snapshot`: キー順が安定し、マスタ変更後も hash が再計算で一致すること

### 10.2 レイアウトのゴールデン

`src/pdf/layout.golden.test.ts`。PDF 画素は撮らない（レンダラ差で壊れる）。`measure` の数値契約を固定する。

| ID | 条件 | 期待 |
| --- | --- | --- |
| L1 | 1行、短い品名 | fontPt = MAX、fits |
| L2 | 折り返しなし 18行 | fits（下限 font 以上） |
| L3 | 折り返しなし 40行 | fits=false, LAYOUT_OVERFLOW |
| L4 | 全角 80字の品名 × 12行 | 折り返しを高さに算入。L2より厳しい |
| L5 | 10%+8%+凡例+振込2口座+長い note | 固定部が増え、明細予算が減る |
| L6 | font を 6pt まで下げれば入るケース | それでも MIN=7 で overflow |

HTML 生成器は、`fit` が返した fontPt 以外の字サイズをテンプレートに埋め込まないことをスナップショットする。

### 10.3 DB・バックアップ

- マイグレーション: 空ファイルに 0001 を当て、PRAGMA と CHECK 制約を確認
- 発行トランザクション: PDF 書き込みを投げて失敗させても、番号巻き戻しが起きない / または全体ロールバックのどちらに固定したかをテストで固定する（本設計は「番号消費 + 再試行」。ロールバック派に変えない）
- リストア: 壊した ZIP、hash 改ざん、途中欠け PDF、schema 未来版、をすべて reject。現行 DB が残ること
- `integrity_check` 失敗の起動: 空DB新造をしないこと

### 10.4 やらないテスト

- 「見た目がきれい」のスクショ差分を CI ゲートにしない
- 実機の印刷プレビュー画素を税の正解にしない

---

## 11. リスク

| リスク | 深刻度 | 扱い |
| --- | --- | --- |
| ユーザーが発行済みを「ちょっと直したい」 | 高 | ボタンを置かない。修正インボイスへ誘導。これが離脱になっても適格請求書を壊さない |
| 明細が多い仕事 | 中 | 発行拒否 + 分割時の端数差警告。2ページ自動生成で逃げない |
| iOS が日次バックグラウンドを殺す | 高 | フォアグラウンド本線。発行の都度バックアップ |
| Android アンインストールで専用領域が消える | 高 | 初回に外部フォルダを必須扱いの UX |
| ユーザーがバックアップを iCloud に置き、競合と同じ死に方をする | 中 | 本線にしない。マニュアルで「Files のこのフォルダを PC にもコピー」と書く |
| `expo-print` が計測と違う改ページをする | 高 | 固定 mm レイアウト、縮小済み font、余白に余裕。実機3種で L2/L3 を目視確認 |
| 整数 `number` の精度 | 低 | 1書類合計を 2^53 円未満に CHECK |
| 買い切りを再インストールで失う | 中 | Store の restore。アンロック状態はバックアップに含めない（端末+ストアが正） |
| 国税庁 API を入れたくなる | 中 | v1 は入れない。オフライン発行を殺す。任意照合は警告のみ |
| 電子帳簿保存法不足を「対応」と書いて訴追リスク | 中 | ストア文言は「適格請求書の作成と写しの端末内保存」。電帳法完全対応を称さない |
| WAL 放置でバックアップが古い | 中 | backup API + checkpoint を pack の必須手順にする |

---

## 12. 却下した代替案

| 案 | 却下理由 |
| --- | --- |
| 明細行ごとに消費税を計算して合算 | 法令上、記載事項⑤にできない |
| 税込価格だけ持って「内税」を行に印字 | 電卓一致感は出るが、⑧と⑩が混ざった瞬間に行税額の合計が⑤とずれる |
| 発行済み請求書の上書き編集 | 写しの保存義務と修正義務に反する。差分が消える |
| 下書き時点で正式番号を確保 | 破棄が欠番を生み、ユーザーが欠番埋めをしたくなる。欠番埋めは二重番号事故の元 |
| 番号の手入力 | 重複と、取引先に渡した番号の再利用 |
| 見積 PDF を「適格請求書」レイアウトで出す | 取引先がそれを保存して控除する |
| 法人番号チェックデジットを全 T 番号に適用 | 個人事業主を誤却下する |
| ORM + 自動マイグレーション | 発行済み UPDATE が容易になり、SQL レビューが死ぬ |
| 金額を `number` の小数または float 文字列 | `0.1 * 3333` 問題。ゴールデンが環境で揺れる |
| 2ページ PDF または縮小無限 | 競合苦情の再現。7pt 未満は記載したことにならない |
| 行数超過時の自動分割発行 | 書類単位の端数が変わり、合計税額が1枚時と一致しない |
| iCloud / CloudKit 本線 | 復元失敗が競合の主訴。アプリが制御できない |
| バックアップを SQLCipher 必須にする | 鍵喪失 = 全消失。本製品の売りと逆 |
| JSON ファイル群だけ（SQLite なし） | 採番の原子性、外部キー、integrity_check を失う |
| Realm / Watermelon 同期前提 | サーバ無し方針と逆。競合マージで発行済みが変異しうる |
| サーバ側レシート必須の IAP | オフライン・サーバレス方針を壊す |
| v1 から修正・返還を外す | 不変にした瞬間、現場は「編集」を要求し、例外パスが生まれる |
| 適格簡易請求書を同一テンプレで兼用 | 宛先省略が通常請求に漏れ、⑥が落ちる |

---

## 13. 他の観点への反論・懸念

この節は、データ保護・シンプルさ・UX を最適化した設計が持ち込みがちな判断に、適格請求書と消費税の視点から反対する。相手の懸念は無視しない。ただし本アプリが折れてはいけない線を示す。

### 13.1 データ保護（機密性・暗号化・最小露出）視点への反論

データ保護側が欲しがるもの: SQLCipher、生体認証ロック必須、Files への平文書き出し禁止、PDF を共有ストレージに置かない、バックアップに署名鍵。

反対する点:

- **復元不能な暗号化は、この商品では情報漏洩より事故が大きい。** 競合への苦情は漏洩ではなく消滅である。発行済み適格請求書の写しは7年残さねばならない。ユーザーが PIN を忘れ、鍵が端末の Secure Enclave にしか無いバックアップは、税務上「写しが無い」と同じになる。
- **Files に出すのは欠陥ではなく保存義務の実装である。** アプリサンドボックスだけに閉じると、端末故障・機種変更・アンインストールで消える。それはデータ保護の「閉じる」成功であり、本製品の失敗である。
- **バックアップを読めない形にするな。** SHA-256 による改ざん検知は要る。秘密鍵による暗号化は v2 の任意にするなら、鍵のエクスポートを平文バックアップと同等の手順で強制するまで有効化しない。

妥当な取り込み: アプリ起動 PIN は任意でよい。盗難時の覗き見は減る。ただし PIN 忘れで DB をwipeする実装は禁止。ロックは「開かない」であり「消す」ではない。

データ保護側が正しく、こちらが借りるべき点: バックアップ ZIP をメールに自動添付しない、分析 SDK を入れない、登録番号と取引先を遠隔に送らない。オフラインは税の正しさだけでなく漏洩面でも正しい。

### 13.2 シンプルさ視点への反論

シンプルさ側が欲しがるもの: 税率は10%だけ、税込総額だけ見せる、行ごとの税、修正・返還は「同じ番号で直す」、マスタ無しの毎回手入力、端数は `Math.round`。

反対する点:

- **8% を省略した適格請求書は、飲食料品や新聞を一行でも扱う事業者に対して不完全である。** 軽減の「その旨」は記載事項③そのもの。v1 の対象を「フリーランス（役務10%だけ）」にnarrowしても、品目に軽減区分を持たない設計は後から破壊的マイグレーションになる。区分列は最初から必須にし、使わなければ standard だけ選べばよい。
- **行ごとの税は単純に見えて、法令の⑤を満たさない。** G1 と「行ごと floor」は数円ずれる。数円でも、積上げ計算をする取引先や、税務調査で写しを突合されたときに説明できない。単純な実装が単純な法令ではない。
- **「同じ番号で直す」は一番短いコードであり、一番危険な運用である。** 取引先が旧 PDF を保存している可能性がある。売手の写しが新内容だけになると、当初交付分が消失する。修正インボイスを別番号で足す方が画面は増えるが、義務の形に沿う。
- **`Math.round(x * 0.1)` は短い。禁止する。** 二進小数と、half_up の定義の両方を曖昧にする。

シンプルさ側が正しく、こちらが借りるべき点: 画面に税モード切替を毎行出さない。書類作成中に 税抜/税込 を切り替えると対価の意味が反転するので、発行者デフォルトを引き継ぎ、書類ごとにロックする。設定項目を増やしすぎない。公開 API は `calculateTotals(lines, mode, rounding)` の一つだけ。

### 13.3 UX 視点への反論

UX 側が欲しがるもの: 発行後編集、大きな文字と余白、ページをまたぐ長い明細、登録番号の「それらしい自動補完」、プレビュー無しの即共有、見積と請求の同一画面、赤い「無効化」で請求を消す、A4 に収めたいならフォントを 5pt まで自動縮小。

反対する点:

- **発行後編集は親切ではなく、取引先の仕入税額控除を壊しにいく。** 「まだメールしていないから」はアプリには分からない。発行 = 写しの確定、と教える方が、後で謝るより短い。
- **2ページに流す快適さは、競合が嫌われている理由そのもの。** 印刷して2枚目が白紙ヘッダだけ、または合計が2枚目に落ちる、は「きれいなテンプレ」の失敗である。拒否の方が体験として正直である。
- **5pt 自動縮小は、記載したことにならない。** 読めない登録番号は記載欠けに等しい。7pt 下限で overflow にする。
- **登録番号の自動補完・チェックデジット補正はしない。** 1桁違えば別人である。形式エラーは止め、推定で発行しない。
- **見積と請求を同一編集画面にすると、表題と登録番号の出し分けが必ず1箇所漏れる。** フローは分け、コンポーネントは共有する。
- **「無効化して消す」はユーザーが望む言葉だが、写しを消す言葉である。** 返還請求書で打ち消す。一覧に赤バナー「この請求は取り消されました」は出してよいが、本体 PDF は残す。

UX 側が正しく、こちらが借りるべき点: 発行前のプレビューは大きく、税率別内訳は下書き中から常時見せる。overflow 時は「何行落とすと入るか」を具体的に言う。修正インボイス作成は元書類のコピーから始め、変更点をユーザーが確認してから発行する。不変は冷たい画面ではなく、**発行前に迷わせ、発行後に迷わせない**ことで実現する。

### 13.4 それでも本視点が間違っているかもしれない場所

- 電帳法の検索要件・タイムスタンプを「写しがある」だけで足りると割り切っている。税務調査の現場によっては不足と言われる可能性がある。v1 のストア文言で誇大にしない。
- 1枚制約は、翻訳者・士業の30行請求を切り捨てる。分割警告を出しても離脱するなら、v2 で「ユーザー明示の複数適格請求書ウィザード」（税率端数を書類ごとに再計算し、差額を画面に出す）を検討する。自動2ページではない。
- 平文バックアップは共同利用の iPad や、Files を家族と共有している端末では漏洩する。その世帯には向かない。対象は「自分の事業データは自分の Files に置く」人である。

---

## 14. 実装順序（設計の拘束）

コードを書くときは、画面より先に次を閉じる。

1. `domain/tax.ts` + ゴールデン G1–G12 が通る
2. `registrationNumber` と `transitions`
3. `0001_init.sql` と migrate、発行トランザクション（PDF はフェイク）
4. `layout.ts` + L1–L6
5. HTML テンプレートが計測値以外の字サイズを持たないこと
6. pack / unpack / 改ざん拒否 / 現行保全
7. 画面。発行ボタンは 1–6 のゲートの後ろにしか置かない

税のゴールデンが赤のままテンプレートの色を調整し始めない。それが本視点の最後の拘束である。
