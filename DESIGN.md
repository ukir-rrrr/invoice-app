# 請求書アプリ 設計書（v1）

- プロダクト名（仮）: **一枚請求**
- 視点: **ユーザー体験（UX）**
- 対象: 日本のフリーランス・個人事業主・少人数の小規模事業者
- 形態: Expo（React Native / TypeScript / expo-router）の iOS / Android アプリ
- 販売: 買い切り 980〜1,500円（アプリ内課金なし、アカウントなし）
- 制約: サーバーなし。データは端末内のみ。オフラインが正規状態。
- 本文書の位置づけ: 実装前の意見のある設計。ライブラリ、データ、アルゴリズム、画面、テスト、捨てた案まで固定する。実装時に迷ったら「1分で送れるか」で決める。

---

## 1. 設計原則（UXを絶対条件にする）

競合のレビューで繰り返される失敗は次の3つである。

1. ある日データが消える
2. iCloudバックアップから戻せない
3. PDFがA4の2枚目に見切れ・はみ出しする

本アプリの売りは「消えない」「戻せる」「必ず1枚」である。ただしそれは**安心の土台**であって、日常の操作ではない。日常は次の一文に尽きる。

> フリーランスが電車の中で、スマホ片手に、60秒以内に請求書を作って送れる。

この一文を満たせない機能は、正しくてもv1に入れない。満たすために複雑さが増える機能（前回複製、取引先のインライン生成、バックアップ状態の常時表示）は、たとえ実装コストが高くても入れる。

### 1.1 体験の非交渉条件

| # | 条件 | 合格ライン |
|---|---|---|
| T1 | 2回目以降の請求書作成 | ホームから **3タップ** で共有シートが開く |
| T2 | 初回（発行者情報入力後） | **60秒** 以内にPDF共有まで到達できる |
| T3 | バックアップ状態 | ホームを開いた瞬間に、最終成功時刻と健全性が読める |
| T4 | PDF | いかなる明細数でも **2ページ目を出さない**。読めないほど小さくするくらいなら生成を拒否する |
| T5 | 再入力 | 同じ取引先・同じ品目を、マスタ画面を経由せずに再利用できる |
| T6 | 失敗の回復 | 誤タップでデータが消えない。リストアは現状を壊す前に検証する |

### 1.2 この視点が意図的に捨てるもの

- ダッシュボード、売上グラフ、年次推移。開いた瞬間に「作る」以外の情報いらない。
- ウィザード形式の5画面作成。スクロール1枚とボトムシートで完結させる。
- 送信前の長いチェックリスト。適格請求書に必要な欠落は**赤く示すが止めない**（免税事業者も使う）。
- 発行後の請求書を法律家向けに改竄不能にする。誤金額の修正ができないアプリは使われない。
- 起動のたびに生体認証。任意設定に閉じる。毎日の請求作業を鍵の向こうに置かない。

---

## 2. ターゲット体験：60秒で送る

### 2.1 ペルソナと作業の実態

- 月5〜40枚の請求書を出す一人事業（デザイン、開発、執筆、制作、コンサル）。
- 取引先は10件前後で固定。品目も「制作費」「保守」「記事執筆」など繰り返し。
- 現場はPCよりスマホが多い。クライアントからLINEで「請求書お願いします」と来て、その場で送りたい。
- 税の知識は「10%と8%がある」「インボイス番号を書く」まで。端数処理の法令名は知らない。
- バックアップを自分から設定しない。消えてから泣く。

### 2.2 ゴールデンパス（2回目以降、同一取引先）

```
ホーム
  → 「前回と同じ」カードをタップ          … tap 1
  → 金額が正しければ「PDFを送る」         … tap 2
  → システムの共有シートでLINE/メール     … tap 3
```

所要時間の内訳（目標）:

| 区間 | 上限 |
|---|---|
| 起動〜ホーム描画（直近3件+バックアップチップ） | 400ms |
| 「前回と同じ」で編集画面が開く（コピー済み） | 200ms |
| PDF生成（典型3〜8行） | 700ms |
| 共有シート表示 | OS依存 |

金額を変える場合でも、明細行の金額をタップしてテンキーを出すだけにする。行の追加は「よく使う品目」チップを1タップ。

### 2.3 初回パス（インストール直後）

初回だけ発行者情報を聞く。ここをウィザード5問にすると離脱するので、**1画面・必須3欄**にする。

必須:

1. 屋号または氏名
2. 住所（1欄、改行可）
3. 振込先（1欄、プレースホルダで「銀行 支店 普通 1234567 名義」）

任意（後回し可、PDFには出ないだけ）:

- 適格請求書発行事業者登録番号（`T` + 数字13桁）
- 電話 / メール
- ロゴ（v1.1。v1は文字のみ）

入力後すぐに「誰に出しますか？」へ進み、取引先名を1欄打てば請求書編集に入れる。取引先マスタの事前整備は**要求しない**。インラインで作った名前は自動でマスタに残る。

### 2.4 スマートデフォルト（毎回聞かない）

| 項目 | デフォルト | 理由 |
|---|---|---|
| 帳票種別 | 請求書 | 見積より請求の方が頻度が高い |
| 税率 | 標準10%。行ごとに8%へ切り替え | 軽減は行の属性であり帳票の属性ではない |
| 税入力 | 税抜 | B2B請求は税抜で考える人が多い |
| 端数 | 税率ごとに1回、切り捨て | 日本の実務で最も多く、説明が短い |
| 支払期限 | **翌月末** | 国内商習慣。`+30日`より予測しやすい |
| 請求日 | 今日 | — |
| 請求番号 | `INV-YYYY-NNN` の自動採番 | 手入力させない |
| 見積番号 | `EST-YYYY-NNN` | 同上 |
| 件名 | `{取引先名} 御中 {年月} 分` | 空欄スタートより直す方が速い |
| 源泉徴収 | OFF。設定でデフォルトON可 | 対象者には必要。非対象者の画面を汚さない |

源泉徴収（所得税10.21%）は、ユーザー指定のv1範囲には無い。しかし対象フリーランスが最後にExcelへ逃げる最大理由なので、**請求書フッタの任意1トグルとしてv1に入れる**。計算は「税抜合計 × 10.21%、円未満切り捨て」。法令の例外（100万円超の50.105%など）はv1では扱わず、100万円超で注意文だけ出す。

---

## 3. ライブラリ選定と理由

方針: **OSの共有・印刷・ファイルに乗る**。自前でPDFエンジンや同期基盤を持たない。依存は「画面を減らす」「1枚PDFを保証する」「バックアップをユーザーがFinder/ファイルアプリで触れる」ことに直結するものだけにする。

### 3.1 採用（v1固定）

| ライブラリ | 役割 | 採用理由（UX起点） |
|---|---|---|
| Expo SDK 53+（現行安定） | 実行基盤 | OTAで致命的なPDF/バックアップ修正を配れる。買い切りでも「消えた」は許されない |
| `expo-router`（file-based） | 画面遷移 | ディープリンクで「この請求書」を開ける。後からウィジェットや共有拡張を足しやすい |
| React Native + TypeScript | UI | スマホのタップ間距離・キーボード・共有シートが第一級 |
| `expo-sqlite` | 永続化 | リレーショナル（取引先×帳票×明細×税率）をSQLで表現できる。単一ファイルなのでバックアップ単位が明確 |
| `expo-print` | HTML → PDF | A4の `@page` と日本語フォント埋め込みをHTML/CSSで制御できる。行数に応じた縮小をテンプレ変数で段階化しやすい |
| `expo-sharing` | 共有シート | 「送る」の終点。LINE / メール / Files へ**追加UIなし**で出せる |
| `expo-file-system/next` | バックアップI/O | 一時ファイル→renameの原子書き込みができる |
| `expo-document-picker` | リストア元選択 | ファイルアプリの`.invbak`を1タップで選ばせる |
| `jszip` | バックアップ容器 | sqlite + manifest + ハッシュを1ファイルにまとめ、ユーザーがAirDrop/Driveに置ける |
| `fast-text-encoding` / Web Crypto (`crypto.subtle`) | SHA-256 | 改変・破損をユーザー向け文言で即判定する |
| `expo-keep-awake` | PDF生成中 | 生成中に画面が落ちて「壊れた」と思わせない |
| `react-native-safe-area-context` | 余白 | ホームの主ボタンがホームインジケータに沈まない |
| Jest + `@testing-library/react-native` | テスト | 税とレイアウトを端末なしで固定する |

日付は `Intl.DateTimeFormat('ja-JP')` で足りる。和暦は設定フラグで `era: 'long'` を足すだけなので moment 系は入れない。

状態管理ライブラリは**入れない**。画面の正本はSQLite。編集中の帳票だけ React state（または `useDocumentDraft` フック）に持つ。同期・競合・キャッシュ層はオフライン単一ユーザーには害でしかない。

### 3.2 採用しない（理由は §11 にも書く）

| 候補 | 不採用理由 |
|---|---|
| WatermelonDB / Realm / PowerSync | 同期前提のAPIが、単一sqliteファイルの丸ごとバックアップを汚す |
| `expo-secure-store` をバックアップ鍵に使う | 機種変で鍵が消え、競合と同じ「戻せない」を自作する |
| SQLCipher | パスワード紛失 = 全データ喪失。売り（復元できる）と矛盾 |
| `react-native-html-to-pdf` / `react-native-pdf` | Expo開発ビルド必須が増え、縮小ロジックのテストが難しい |
| `react-native-view-shot` で画面をPDF化 | 印刷品質とA4寸法がOSフォント依存になり、ゴールデンテスト不能 |
| iCloud / Google Drive SDK 直接 | 競合の最大苦情。OSバックアップに運命を預けない |
| 自前サーバー / Clerk / Firebase | 売りが「端末から出ない」。980円に継続費を載せられない |
| `react-hook-form` + Zod全画面 | 請求書編集は「行の増減」が本体。フォームライブラリがタップを増やす |
| `expo-background-fetch` / バックグラウンド定期実行 | iOSが殺す。ユーザーは「毎日自動」と思っているのに止まっている方が危険 |

### 3.3 日本語PDFフォント

`expo-print` のHTMLは、端末のウェブビューに入っているフォントに依存すると機種で行の折返しが変わり、1枚保証が崩れる。v1は **Noto Sans JP（Regular / Medium）をアプリに同梱し、HTMLへBase64埋め込み**する。

- ファイル: `assets/fonts/NotoSansJP-Regular.ttf` などサブセット版
- サブセット対象: 漢字JIS第1 + かな + 英数 + 請求書で使う記号（`¥` `％` `①` は使わない、`※` `・` `（）`）
- 目標サイズ: サブセット後 1.5MB以下。アプリ容量より「機種で2枚になる」事故の方が高い

---

## 4. データ表現

### 4.1 金額は整数円。浮動小数は禁止

日本円に小数円は使わない。税額・源泉・合計はすべて整数円。中間計算も整数で行い、割り算が出る箇所はアルゴリズム側で端数を明示する。

数量だけ小数が要る（1.5時間、0.25人日）。`quantity_milli INTEGER` として千分の1を整数保存する（1.5 = 1500）。表示は末尾0を落とす。

単価は整数円。数量×単価の行金額は

```
line_ex = floor(unit_price_ex * quantity_milli / 1000)
```

で整数化する。ここを四捨五入にすると税率ブロックの合計とずれるので、**行金額は切り捨てで固定**する。端数のユーザー設定は「税率ごとの税額」にだけ効かせる。

### 4.2 日付は ISO 日（`YYYY-MM-DD`）

時刻は持たない。支払期限の「翌月末」計算は端末のローカルタイムゾーンで行う。`due_date` は計算結果の日付文字列を保存し、後からTZを変えても動かないようにする。

### 4.3 帳票は「見積」と「請求」を同一テーブル

UIも同一編集画面。`kind` が `quote | invoice`。見積→請求は行コピー + 新番号 + `source_quote_id`。変換後も見積は残す（「消えた」と思わせない）。

### 4.4 発行者情報は1行の設定であり、帳票にもスナップショットする

適格請求書は「書いた時点の登録番号・屋号」が残らなければ意味がない。設定を後から変えても過去PDF用データは帳票行に残す。

```
documents.issuer_snapshot_json
```

中身は `{ name, address, bank, registrationNo, tel, email }`。PDFはスナップショットを読む。設定画面は「これから作る帳票」のデフォルトだけを変える。

### 4.5 下書きと発行済みを法律的に分けない

`status` は UX用の柔らかい印:

- `draft` … まだPDFを出していない
- `sent` … 共有シートを閉じた（送ったとみなす）
- `paid` … 入金済み（手動）
- `void` … 破棄（非表示。物理削除しない）

`sent` 以降も編集できる。編集すると `revised_at` が立つ。改訂番号は付けない（v1）。監査ログより「金額を直して再送できる」を優先する。

### 4.6 バックアップはアプリDBの外にある成果物

バックアップファイルはDBにBLOBで持たない。持ったらDBが肥大し、バックアップのバックアップになる。アプリが持つのは**実行履歴**だけ（時刻、パス、ハッシュ、結果）。

### 4.7 ドメイン上の主要な型（実装時の TypeScript 像）

```ts
type TaxRate = 10 | 8;
type Rounding = 'floor' | 'ceil' | 'half_up';
type DocKind = 'quote' | 'invoice';
type DocStatus = 'draft' | 'sent' | 'paid' | 'void';

type MoneyYen = number; // 整数円。小数は型として排除する運用
type QuantityMilli = number; // 1.5時間 = 1500

interface LineInput {
  itemId: string | null;
  description: string;
  quantityMilli: QuantityMilli;
  unit: string;          // 「式」「時間」「人日」「ヶ月」
  unitPriceEx: MoneyYen;
  taxRate: TaxRate;
}

interface TaxBucket {
  rate: TaxRate;
  taxableEx: MoneyYen;
  tax: MoneyYen;
  taxableIn: MoneyYen;   // taxableEx + tax
}

interface DocumentTotals {
  buckets: TaxBucket[];  // 10% を先、8% を後。0円の税率は出さない
  subtotalEx: MoneyYen;
  taxTotal: MoneyYen;
  totalIn: MoneyYen;
  withholding: MoneyYen; // 0 if off
  payable: MoneyYen;     // totalIn - withholding
}
```

---

## 5. SQLスキーマとマイグレーション

単一ファイル `invoice.db`。`PRAGMA journal_mode = WAL;` `PRAGMA foreign_keys = ON;` `PRAGMA busy_timeout = 3000;`。

マイグレーションは `src/db/migrations.ts` の配列で、`schema_version` テーブルの整数と対応させる。起動時:

1. `PRAGMA user_version` を読む
2. 未適用を番号順に適用
3. 各マイグレーションは1トランザクション
4. 失敗したら例外を出してアプリを「修復画面」へ。中途半端な適用は残さない

v1の初期スキーマは **001 だけ**。列追加は 002 以降。破壊的変更は「新テーブル作成→コピー→切替」を必須とし、`DROP COLUMN` しない。

### 5.1 001_init.sql

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO schema_meta(key, value) VALUES
  ('app_schema', '1'),
  ('created_at', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE TABLE settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  issuer_name           TEXT NOT NULL DEFAULT '',
  issuer_address        TEXT NOT NULL DEFAULT '',
  issuer_bank           TEXT NOT NULL DEFAULT '',
  issuer_tel            TEXT NOT NULL DEFAULT '',
  issuer_email          TEXT NOT NULL DEFAULT '',
  registration_no       TEXT NOT NULL DEFAULT '',          -- '' or 'T' + 13 digits
  default_tax_input     TEXT NOT NULL DEFAULT 'ex' CHECK (default_tax_input IN ('ex')),
  rounding              TEXT NOT NULL DEFAULT 'floor' CHECK (rounding IN ('floor','ceil','half_up')),
  default_due_rule      TEXT NOT NULL DEFAULT 'next_month_end',
  default_withholding   INTEGER NOT NULL DEFAULT 0 CHECK (default_withholding IN (0,1)),
  invoice_seq_year      INTEGER NOT NULL DEFAULT 0,
  invoice_seq           INTEGER NOT NULL DEFAULT 0,
  quote_seq_year        INTEGER NOT NULL DEFAULT 0,
  quote_seq             INTEGER NOT NULL DEFAULT 0,
  backup_dir_hint       TEXT NOT NULL DEFAULT '',
  last_backup_at        TEXT,
  last_backup_sha256    TEXT,
  era_style             TEXT NOT NULL DEFAULT 'seireki' CHECK (era_style IN ('seireki','wareki')),
  updated_at            TEXT NOT NULL
);

INSERT INTO settings (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE TABLE clients (
  id            TEXT PRIMARY KEY,           -- ulid
  name          TEXT NOT NULL,
  honorific     TEXT NOT NULL DEFAULT '御中',
  address       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  last_used_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  archived_at   TEXT
);

CREATE INDEX idx_clients_last_used ON clients(last_used_at DESC);
CREATE INDEX idx_clients_name ON clients(name);

CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  default_unit    TEXT NOT NULL DEFAULT '式',
  default_price_ex INTEGER NOT NULL DEFAULT 0,
  default_tax_rate INTEGER NOT NULL DEFAULT 10 CHECK (default_tax_rate IN (8,10)),
  last_used_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  archived_at     TEXT
);

CREATE INDEX idx_items_last_used ON items(last_used_at DESC);

CREATE TABLE documents (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN ('quote','invoice')),
  status               TEXT NOT NULL CHECK (status IN ('draft','sent','paid','void')),
  number               TEXT NOT NULL,
  client_id            TEXT REFERENCES clients(id),
  client_name_snap     TEXT NOT NULL,
  client_addr_snap     TEXT NOT NULL DEFAULT '',
  client_honorific     TEXT NOT NULL DEFAULT '御中',
  issuer_snapshot_json TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT '',
  issue_date           TEXT NOT NULL,               -- YYYY-MM-DD
  due_date             TEXT,                        -- quotes may be null
  notes                TEXT NOT NULL DEFAULT '',
  rounding             TEXT NOT NULL,
  withholding_on       INTEGER NOT NULL DEFAULT 0,
  withholding_yen      INTEGER NOT NULL DEFAULT 0,
  subtotal_ex          INTEGER NOT NULL DEFAULT 0,
  tax_total            INTEGER NOT NULL DEFAULT 0,
  total_in             INTEGER NOT NULL DEFAULT 0,
  payable              INTEGER NOT NULL DEFAULT 0,
  source_quote_id      TEXT REFERENCES documents(id),
  layout_stage         TEXT,                        -- comfortable/compact/dense/emergency
  revised_at           TEXT,
  sent_at              TEXT,
  paid_at              TEXT,
  voided_at            TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_documents_number_kind ON documents(kind, number);
CREATE INDEX idx_documents_client ON documents(client_id, issue_date DESC);
CREATE INDEX idx_documents_status ON documents(status, updated_at DESC);
CREATE INDEX idx_documents_kind_date ON documents(kind, issue_date DESC);

CREATE TABLE document_lines (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  item_id         TEXT REFERENCES items(id),
  description     TEXT NOT NULL,
  quantity_milli  INTEGER NOT NULL,
  unit            TEXT NOT NULL,
  unit_price_ex   INTEGER NOT NULL,
  tax_rate        INTEGER NOT NULL CHECK (tax_rate IN (8,10)),
  amount_ex       INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_lines_doc ON document_lines(document_id, position);

CREATE TABLE document_tax_buckets (
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rate         INTEGER NOT NULL CHECK (rate IN (8,10)),
  taxable_ex   INTEGER NOT NULL,
  tax          INTEGER NOT NULL,
  taxable_in   INTEGER NOT NULL,
  PRIMARY KEY (document_id, rate)
);

CREATE TABLE backup_runs (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  result        TEXT NOT NULL CHECK (result IN ('success','failed','skipped')),
  trigger       TEXT NOT NULL CHECK (trigger IN ('launch','after_send','manual')),
  file_name     TEXT,
  sha256        TEXT,
  doc_count     INTEGER,
  byte_size     INTEGER,
  error         TEXT
);

CREATE INDEX idx_backup_runs_time ON backup_runs(started_at DESC);
```

### 5.2 採番

`settings.invoice_seq_year` と `invoice_seq` を、採番時にトランザクションで更新する。

```
年が変わっていたら seq = 1、year = 今年
そうでなければ seq = seq + 1
number = `INV-${year}-${pad(seq,3)}`
```

欠番は気にしない。削除（void）しても番号は再利用しない。ユーザーが番号を手編集するUIはv1に置かない。重複したら（リストア衝突）接尾辞 `-A` を足す。

### 5.3 002 以降の約束

- 002 で初めて列を足すなら `ALTER TABLE ... ADD COLUMN` + 既存行の埋値を同じトランザクションで行う
- リストアは「ファイルに入っている schema version をそのまま戻す」。その後、今のアプリが持つ未適用マイグレーションを回す
- 未来のアプリが古いバックアップを読めることより、**古いアプリが新しいバックアップを拒否して明示する**方が安全。manifest の `minAppVersion` で止める

### 5.4 なぜ正規化をここで止めるか

税率内訳を `document_tax_buckets` に永続化するのは、PDF再生成とリストア後の表示を計算関数に再依存させないため。計算ロジックを後で直しても、発行済みの数字が動かない。UX的には「昨日送った金額と今日開いた金額が違う」が最悪の不信だからである。

逆に、品目マスタを帳票行へカスケード更新しない。行はスナップショット。マスタの単価を変えても過去の請求は動かない。

---

## 6. 主要アルゴリズム

### 6.1 消費税と端数

適格請求書の要件に合わせ、**税額の端数処理は税率ごとに1回**。行ごとに消費税を出して足さない（積上げ計算は法令上あり得るが、行数で合計が揺れるのでv1のデフォルトにしない）。

#### 入力

- 各行: `quantity_milli`, `unit_price_ex`, `tax_rate ∈ {8,10}`
- 帳票: `rounding ∈ {floor, ceil, half_up}`
- 帳票: `withholding_on`

#### 手順（これが唯一の正）

```
1. 各行
   amount_ex = floor(unit_price_ex * quantity_milli / 1000)

2. 税率 r ごと
   taxable_ex[r] = sum(amount_ex of lines where tax_rate = r)

3. 税率 r ごと、1回だけ
   raw = taxable_ex[r] * r / 100     // 有理数。実装は整数演算で
   tax[r] = round_yen(raw, rounding)
   taxable_in[r] = taxable_ex[r] + tax[r]

   整数演算:
     product = taxable_ex[r] * r
     floor   = product / 100
     rem     = product % 100
     ceil    = rem === 0 ? floor : floor + 1
     half_up = rem >= 50 ? floor + 1 : floor

4. subtotal_ex = sum(taxable_ex)
   tax_total   = sum(tax)
   total_in    = subtotal_ex + tax_total

5. withholding
   off → 0
   on  → floor(subtotal_ex * 1021 / 10000)    // 10.21%
   1,000,000超は同じ計算のまま、注意バナーだけ出す

6. payable = total_in - withholding
```

`round_yen` 以外の経路で円を作ることを禁止する。テストは §9 のゴールデンケースが仕様の一部である。

#### 画面への出し方

- 明細: 税抜金額と、行末に小さな `10%` / `軽減8%`
- 合計欄は固定でこの順:
  1. 小計（税抜）
  2. 消費税10%（対象額と税額）
  3. 消費税8%（ある行だけ）
  4. 合計（税込）
  5. 源泉徴収税額（ONのとき）
  6. ご請求額

税率内訳を「詳細を開く」の裏に置かない。適格請求書の本体であり、確認のためのタップを増やさない。

#### 登録番号

- 設定に保存。正規表現 `^T[0-9]{13}$`
- 入力UIは `T` を固定表示し、13桁だけ打たせる。ハイフンは受けたら剥がす
- チェックディジット検証はv1ではしない（誤った検証で弾く方が害）
- 空でもPDFは出る。空のときは帳票に登録番号行を出さない。ホーム画面に「適格請求書にする」の弱いヒントだけ出す

### 6.2 A4 1枚保証

#### 物理制約

| 量 | 値 |
|---|---|
| 用紙 | A4 210mm × 297mm |
| 余白 | 上下左右 12mm（印刷欠け回避。10mmは機種により危険） |
| 本文領域 | 186mm × 273mm |
| 基準CSS | `@page { size: A4; margin: 12mm; }` 幅 186mm を 703px 相当（96dpi換算）で組む |
| フォント | 埋め込み Noto Sans JP のみ |

#### 計測は実印刷の前に純関数で行う

実PDFを毎回作ってページ数を数えると遅いし、テストが端末依存になる。**行の折返しを自前で見積もる**。

全角1em、半角0.5em、フォントサイズ `fs` mm、行の使用幅 `colDescWidth` mm として

```
charsPerLine = floor(colDescWidth / (fs * 0.95))   // 0.95 は実測マージン
descLines    = max(1, ceil(visualLength(description) / charsPerLine))
rowHeight    = paddingY * 2 + descLines * (fs * 1.35)
```

`visualLength` は全角1、半角0.5、絵文字はv1入力禁止（貼り付け時に除去）。

帳票の見積高さ:

```
H =
  header(発行者+宛先+番号) +
  title +
  tableHeader +
  sum(rowHeight) +
  taxBlock +
  bankBlock +
  notesBlock +
  footer
```

`H <= 273mm` ならその段階で採用。

#### 縮小は4段階。無段階スケールはしない

無段階でフォントを0.1ptずつ下げると、機種差で「ほぼ1枚だが2枚目に1行」が再発する。段階を固定し、各段階をゴールデンテストする。

| stage | 本文 | 明細 | 行パディング | 備考・振込 | 用途 |
|---|---|---|---|---|---|
| `comfortable` | 11pt | 10pt | 3.2mm | 全文 | 1〜8行。これが売りの見た目 |
| `compact` | 10pt | 9pt | 2.2mm | 全文 | 9〜16行 |
| `dense` | 9pt | 8pt | 1.4mm | 備考は最大4行で切る | 17〜28行 |
| `emergency` | 8pt | 7pt | 1.0mm | 備考2行、振込を2行に圧縮 | 29〜45行目安 |

7pt未満にはしない。読めない請求書は送らせない。

採用アルゴリズム:

```
for stage in [comfortable, compact, dense, emergency]:
  if estimateHeight(doc, stage) <= 273:
    return stage
refuse("明細が多すぎて1枚に入りません")
```

拒否時のUI（ここがUXの本丸）:

- 2ページに自動分割**しない**
- アラート文言: 「A4の1枚に入りません（現在 N 行）。明細を減らすか、備考を短くしてください。」
- 一次アクション: 「戻って直す」
- 二次: 「先頭から40行で分ける」——新しい下書きをもう1件作り、残り行を移す。勝手に送らない

見積が実際より楽観的だと2枚事故が起きるので、見積は **+3% の安全係数**を掛ける。ゴールデンテストでは「見積 ≤ 273 なら、実PDFのページ数は1」を不変条件にする。実PDFページ数はCIで `pdf-lib` を使い `getPageCount()` する（テスト専用依存。アプリ本体には入れない）。

PDF生成手順:

1. 下書き保存（数字を確定）
2. `chooseStage(doc)` 
3. HTMLテンプレに `stage` と埋め込みフォントを渡す
4. `expo-print.printToFileAsync({ html, width: 595.28, height: 841.89 })`
5. 生成物を `pdf-lib` 相当の軽量チェック（アプリ内は自前: ファイルサイズ>0、およびHTML側に `<!-- pages:1 -->` を出すのではなく、**生成後に再度 estimate を信じつつ**、開発ビルドのみページ数アサート）
6. 本番は estimate の安全係数で賭ける。万一の2枚を潰すため、HTMLに `html, body { height: 277mm; overflow: hidden; }` は**使わない**（切れて印刷される方が2枚より悪い）。拒否まで戻す方が正しい
7. 採用した `layout_stage` を `documents.layout_stage` に保存し、同じデータなら再計算せず再生成できる

テンプレの情報階層（上から、削る順は下から）:

1. 「請求書」または「見積書」の見出し、番号、日付
2. 宛先（氏名+敬称、住所）
3. 発行者（氏名、登録番号、住所）
4. 明細表（品目 / 数量 / 単位 / 単価 / 税率 / 金額）
5. 税率別内訳と合計
6. 振込先
7. 備考
8. 「本請求書は適格請求書です」等の定型は**置かない**（登録番号があれば適格、なければ不要。文言が紙面を食う）

### 6.3 バックアップ / リストア / 破損耐性

売りは「iCloudに頼らない、自分で掴めるバックアップ」である。UXとしてバックアップは**設定の奥ではなく、家の鍵の場所**に置く。

#### いつ書くか（「毎日自動」の実装定義）

OSのバックグラウンド実行は当てにしない。次の3点で「毎日自動」を満たす。

1. **起動時**: フォアグラウンドになったとき、最終成功から20時間以上経っていれば書く
2. **送付直後**: 共有シートを閉じたら書く（いちばん惜しい瞬間）
3. **手動**: バックアップ画面の「今すぐ」

これで「請求書を出した日は必ず1つ残る」。出さなかった日は起動した朝に残る。アプリを30日開かないユーザーは、最後に送った日のバックアップが残る。それが正しい。空の日次ファイルを14個並べても安心は増えない。

#### 置き場（ユーザーがファイルアプリで見える）

- iOS: `documentDirectory` 配下の `Backups/`。`Info.plist` で `UIFileSharingEnabled = true`, `LSSupportsOpeningDocumentsInPlace = true`。ファイルアプリの「このiPhone内 / 一枚請求 / Backups」に見える
- Android: `FileSystem.documentDirectory + 'Backups/'` に加え、初回成功後に「ファイルアプリで見える場所へコピー」を1回だけ案内する。SAFの永続フォルダはv1では必須にしない（権限ダイアログが初回体験を壊す）。代わりに共有シートで `.invbak` をDriveに送る導線をバックアップ画面に常設する

ファイル名:

```
ieichi-YYYYMMDD-HHmmss.invbak
```

拡張子を独自にし、ユーザーが「これ何？」と開いて中身を壊しにくくする。中身はZIP。

#### 容器フォーマット

```
ieichi-….invbak          (zip)
├─ manifest.json
├─ invoice.db
└─ invoice.db.sha256     (hex \n)
```

`manifest.json`:

```json
{
  "format": "ieichi-backup",
  "formatVersion": 1,
  "minAppVersion": "1.0.0",
  "appVersion": "1.0.0",
  "createdAt": "2026-10-12T08:15:00+09:00",
  "schemaVersion": 1,
  "docCount": 12,
  "clientCount": 4,
  "sha256": "<invoice.db の sha256>",
  "byteSize": 81920
}
```

ZIP全体のハッシュは持たない。検証対象は中のDB。ZIPが欠けていれば展開かmanifest検証で落ちる。

#### 書き込み（破損させない）

```
1. PRAGMA wal_checkpoint(TRUNCATE) 相当で invoice.db を単一ファイル化する
2. invoice.db を一時ディレクトリへコピー
3. コピーに PRAGMA integrity_check を走らせ、ok 以外なら中止
4. sha256 を計算
5. manifest を書く
6. zip を Backups/.tmp-*.invbak に書く
7. 同じディレクトリへ atomic rename
8. backup_runs に success を書く / settings.last_backup_* を更新
9. 成功ファイルが 14 を超えたら、古いものから消す
   ただし「直近の成功」と「各月末の最後の1つ（最大12）」は残す
```

失敗しても現行DBは触らない。一時ファイルは消す。

保持ポリシーを「14日分だけ」にしない理由: ユーザーは消えたことに2ヶ月後気づく。月末スナップショット12個は容量的に無視できる（sqliteは数千件でも数百KB）。

#### リストア（1画面、確認は1回）

```
1. ファイルを選ぶ（document picker、.invbak / .zip）
2. zip展開 → 一時ディレクトリ
3. manifest.format === 'ieichi-backup'
4. formatVersion <= アプリが知る最大
5. invoice.db.sha256 と実ファイルの sha256 が一致
6. 一時DBを開いて PRAGMA integrity_check
7. SELECT COUNT(*) FROM documents / clients を読む
8. 画面に出す:
     「12件の請求書、4件の取引先を復元します。
       今のデータ（8件）は置き換わります。
       復元の直前のコピーは自動で残します。」
9. ユーザーが「置き換えて復元」を1回タップ
10. 現行 invoice.db を Backups/pre-restore-*.invbak として 3〜7 と同じ手順で退避
11. 検証済みコピーを invoice.db 位置へ差し替え（先に新しいファイルを置き、openに成功したら旧を捨てる）
12. 未適用マイグレーションを適用
13. 接続を開き直す
14. 「12件を復元しました」+ ホームへ
```

ハッシュ不一致・integrity_check失敗では **現行を一切触らない**。文言は「このファイルは壊れているか、途中でコピーが止まりました。別の日付のバックアップを選んでください。」失敗の技術詳細は折りたたみに1つ。

#### ホームのバックアップ表示（常時）

チップ1つ。色は3段階だけ。

| 状態 | 表示 | 色 |
|---|---|---|
| 24時間以内に成功 | 「バックアップ済 今日 8:15」 | 緑 |
| 24時間〜7日 | 「バックアップ 3日前」 | 琥珀 |
| 7日超 or 失敗 or 0回 | 「バックアップが古い」/「まだありません」 | 赤 |

チップをタップするとバックアップ画面。説明文の前に、大きな「今すぐバックアップ」「バックアップから復元」の2ボタン。最終ハッシュの先頭8文字を小さく出し、「ファイルアプリで同じ名前が見える」ことを一文で書く。

#### 初回だけ出す案内

最初の帳票を1件保存した直後、1回だけシート:

「このアプリは端末の中に保存します。今日のコピーをファイルアプリに書きました。機種変の前に、そのファイルをDriveかPCへ送ってください。」

主ボタンは「バックアップ場所を開く」。閉じたら二度と出さない（設定から再表示可）。

---

## 7. 画面フロー

タブは4つ。これ以上増やさない。

```
[ホーム] [帳票] [取引先] [設定]
```

品目はタブにしない。編集中のチップと、設定内の「よく使う品目」で足りる。

### 7.1 情報設計

```
起動
 └─ 初回？ → 発行者セットアップ（1画面） → ホーム
 └─ それ以外 → ホーム

ホーム
 ├─ 主ボタン「請求書を作る」
 ├─ 主ボタン横の小さな「見積」
 ├─ カード「前回と同じ」（直近の sent/paid 請求書があるときだけ）
 ├─ 直近取引先チップ（最大5、last_used_at）
 ├─ 下書きが1件以上なら「続きから」リスト（最大3）
 ├─ バックアップチップ（常時）
 └─ 直近の帳票3件（タップで編集/再送）

「請求書を作る」
 └─ 取引先ボトムシート
      ├─ 検索入力（先頭フォーカス、キーボード開く）
      ├─ 直近 / ヒット一覧
      └─ 「この名前で追加」 — マスタ画面へ行かない
         → 帳票編集

「前回と同じ」
 └─ 直近帳票を複製（新番号、日付=今日、期限=翌月末、status=draft）
    → 帳票編集（金額が既にある）

帳票編集（見積/請求で同一）
 ├─ 上部セグメント: 見積 | 請求
 ├─ 番号・日付・期限（期限はチップ: 翌月末 / 今月末 / +14日 / なし）
 ├─ 宛先（タップでシート、インライン修正可）
 ├─ 明細
 │    ├─ 行タップで数量・単価をテンキー編集
 │    ├─ 税率は行の `10` / `8` トグル
 │    ├─ 下部「品目チップ」と「空行を足す」
 │    └─ スワイプで削除
 ├─ 合計（税率内訳を常時表示）
 ├─ 源泉トグル
 ├─ 備考（プレースホルダ「検収後、翌月末払い」）
 └─ 固定フッタ
      ├─ 「PDFを送る」（主）
      └─ 「閉じる」（自動保存済み）

PDFプレビュー（編集の上に乗せるモーダル、別タブにしない）
 ├─ 1枚のプレビュー
 ├─ 小さすぎる段階なら「文字を縮小して1枚にしています」
 └─ 主ボタン「送る」→ expo-sharing
      共有シート閉鎖後 status=sent、バックアップ起動

見積のときだけフッタに「請求書にする」
 └─ 確認なしで複製（番号新規、kind=invoice、source_quote_id）
    → 同じ編集画面。元の見積は残る

帳票タブ
 ├─ セグメント: すべて / 下書き / 未入金 / 入金済 / 見積
 ├─ 行: 番号、取引先、金額、日付、状態ドット
 └─ スワイプ: 複製 / 入金済 / 破棄

取引先タブ
 ├─ 検索
 ├─ 行タップで編集 + その取引先の過去帳票
 └─ 「この取引先で作る」主ボタン

設定
 ├─ 発行者（登録番号含む）
 ├─ 端数処理（floor/ceil/half_up、今から作る帳票にだけ効く）
 ├─ 源泉のデフォルト
 ├─ 和暦
 ├─ バックアップ（状態の再掲 + 保持ポリシーの説明）
 └─ 品目マスタ（少なくてよい）
```

### 7.2 タップ予算

| シナリオ | 予算 | 内訳 |
|---|---|---|
| 前回同一内容を再送 | 3 | 前回と同じ → 送る → 共有先 |
| 同じ取引先・金額だけ変更 | 5 | チップ → 行金額 → キー確定 → 送る → 共有先 |
| 新規取引先に初回請求 | 8 | 作る → 名前入力 → 追加 → 品目チップ×1 → 金額 → 確定 → 送る → 共有先 |
| 見積を請求に変換して送る | 4 | 帳票 → 当該見積 → 請求書にする → 送る |
| バックアップを今すぐ取る | 2 | チップ → 今すぐ |
| 復元 | 4 | チップ → 復元 → ファイル選択 → 置き換えて復元 |

予算を超える提案（別画面の品目ピッカー、税率の説明モーダル必須、送信前チェックリスト）は却下する。

### 7.3 空状態とエラー

- 帳票0件のホーム: 図ではなく、主ボタンと「1分で送れます。データは端末の外に出ません。」の2行。
- PDF拒否: §6.2 の文言。設定やFAQへ飛ばない。
- 共有失敗: `sent` にしない。トースト「送れませんでした。PDFは残っています」。
- DB起動失敗: 修復画面。主ボタン「バックアップから復元」。通常UIに入れない。
- 登録番号の形式エラー: 保存ボタンは生かすが、欄の下に「Tと数字13桁」と出す。PDFは番号なしで出る。

### 7.4 使わないパターン

- オンボーディング3枚（イラストキャラ、スワイプ）。発行者入力がオンボーディングである。
- タブのバッジで未入金件数。不安を煽り、作成を遅くする。
- 請求書詳細と編集の2画面。常に編集。プレビューはモーダル。
- 日付ピッカーを開かないと日付が決まらない状態。デフォルトが入っている。

---

## 8. モジュール構成

アプリ本体に「画面の都合」と「円の計算」を混在させない。税と1枚判定は **ReactもSQLiteもimportしない純関数**にする。これがゴールデンテストの前提である。

```
app/
  _layout.tsx                 # SQLite open, マイグレーション, 修復画面分岐
  (tabs)/
    _layout.tsx
    index.tsx                 # ホーム
    documents.tsx             # 帳票一覧
    clients.tsx
    settings.tsx
  setup.tsx                   # 初回発行者
  editor/[id].tsx             # 見積/請求の同一編集
  preview/[id].tsx            # 使わない。プレビューは editor のモーダル
  backup.tsx
  restore.tsx                 # backup に含めてもよい
  repair.tsx

src/
  db/
    open.ts                   # PRAGMA, user_version
    migrations.ts             # 001, …
    migrate.ts
    repos/
      settingsRepo.ts
      clientsRepo.ts
      itemsRepo.ts
      documentsRepo.ts        # 採番とスナップショットをここで閉じる
      backupRunsRepo.ts
  domain/
    money.ts                  # MoneyYen の加算、負数禁止
    tax.ts                    # calculateTotals()  唯一の税計算
    dueDate.ts                # next_month_end など
    number.ts                 # INV-YYYY-NNN
    registrationNo.ts         # normalize / isValid
    withholding.ts            # 10.21%
    copyDocument.ts           # 前回と同じ / 見積→請求
  layout/
    measure.ts                # visualLength, estimateHeight
    stages.ts                 # 4段階の定数
    chooseStage.ts            # stage | 'refuse'
  pdf/
    font.ts                   # base64 キャッシュ
    template.ts               # HTML文字列。段階をclassで切替
    render.ts                 # expo-print 呼び出し
  backup/
    paths.ts
    exportBackup.ts
    restoreBackup.ts
    integrity.ts              # sha256, integrity_check
    prune.ts
  share/
    sharePdf.ts
  ui/
    AmountKeypad.tsx
    BackupChip.tsx
    ClientSheet.tsx
    LineRow.tsx
    TotalsBlock.tsx
    StageBanner.tsx
```

### 8.1 依存方向

```
app / ui  →  repos  →  sqlite
app / ui  →  domain / layout    （純関数）
pdf       →  domain / layout
backup    →  repos / integrity
render    ↛  ui
tax.ts    ↛  expo-* 
```

`documentsRepo.saveDraft` が `calculateTotals` を呼び、行・bucket・合計列を同じトランザクションで書く。UIが合計を独自に足さない。

### 8.2 ルーティング方針

- 編集は常に永続化された `id` を持つ。`/editor/new` は作らない。
- 「請求書を作る」は先に空下書きをINSERTしてから `router.push(/editor/${id})`。戻る・殺しても下書きが残る（「消えた」回避）。
- 空のまま10分以上、明細0でホームに戻ったら、ホームの下書きに残す。自動削除しない。ユーザーがスワイプ破棄する。

---

## 9. テスト戦略

本体の自信は端末のスクショではなく、**税の円と1枚判定のゴールデンファイル**に置く。Jestを既定にする。

### 9.1 税計算（`src/domain/tax.test.ts`）

関数 `calculateTotals(lines, { rounding, withholdingOn })` だけを見る。フィクスチャは `testdata/tax/*.json`。期待値は手計算してファイルに書く。テスト内で再計算して期待値を作らない。

必須ケース（名前が仕様）:

| ID | 内容 | 期待の要点 |
|---|---|---|
| T01 | 行1本 10,000円 10% floor | 税 1,000、合計 11,000 |
| T02 | 行1本 1,001円 10% floor | 税 100、合計 1,101 |
| T03 | 行1本 1,001円 10% ceil | 税 101、合計 1,102 |
| T04 | 行1本 1,005円 10% half_up | 税 101（100.5→101） |
| T05 | 行1本 1,004円 10% half_up | 税 100（100.4→100） |
| T06 | 8% のみ 1,250円 floor | 税 100、合計 1,350 |
| T07 | 10% 8,000 + 8% 1,250、floor | 税800+100、内訳2本 |
| T08 | 複数行で同一税率、行ごとの税を足すと1円ずれるケース（例: 101円×10本、10%） | **税率1回**なので 税101。行積上げ（10×10=100）と違うことを明示 |
| T09 | 数量 1.5（1500）× 単価 1,000 | 行 1,500 |
| T10 | 数量 1.5 × 単価 1 | `floor(1500/1000)=1` |
| T11 | 源泉ON、税抜 50,000 | 源泉 5,105、請求 50,000+5,000-5,105 |
| T12 | 源泉ON、税抜 1,000,001 | 計算は同一式。`overMillion: true` フラグ |
| T13 | 0行 | 全部0。bucketなし |
| T14 | 8%行の金額0（入力途中） | bucketに出さない |
| T15 | 負の単価 | 拒否（例外）。値引きは正の行で別品目「値引き」を負数ではなく正数＋説明で入れる。v1は負数行なし |

T08 は法的にもUX的にも固定したい点なので、コメントに「行積上げとの差」を残す。

### 9.2 レイアウト（`src/layout/chooseStage.test.ts`）

`testdata/layout/*.json` に帳票（行数、品目の文字数、備考の長さ）と期待 `stage | refuse` を置く。

| ID | 行数 | 品目の長さ | 備考 | 期待 |
|---|---|---|---|---|
| L01 | 1 | 短い | 空 | comfortable |
| L02 | 8 | 20字 | 2行 | comfortable |
| L03 | 12 | 20字 | 2行 | compact |
| L04 | 20 | 20字 | 2行 | dense |
| L05 | 36 | 20字 | 2行 | emergency |
| L06 | 20 | 80字折り返し | 8行 | emergency または dense（フィクスチャで固定） |
| L07 | 60 | 短い | 空 | refuse |
| L08 | 40 | 80字 | 10行 | refuse |
| L09 | 0行 | — | 振込4行 | comfortable |

不変条件をテストで書く:

- `stage !== 'refuse'` なら `estimateHeight * 1.00 <= 273`（安全係数込みの関数をテスト対象にする）
- 段階は行を増やすと快適→密の方向にしか動かない（単調性）。行を足してstageが戻ったら失敗

### 9.3 実PDFページ数（CIのみ）

`testdata/layout` のうち `refuse` 以外をHTMLレンダして、Node側でPDFのページ数を1と断言する。`expo-print` はNodeで動かないので、同じテンプレ関数を `puppeteer` か `@react-pdf` ではなく、**テンプレが出力するHTMLを playwright の page.pdf({format:'A4'}) で焼いて pdf-lib で数える**ジョブを `yarn test:pdf` として分ける。ローカルの `yarn test`（Jest）は純関数だけにして、スマホ開発のフィードバックを遅くしない。

このジョブが落ちたら「見積が楽観的」であり、`chooseStage` の安全係数を上げる。テンプレのCSSを感覚で直して見積を放置しない。

### 9.4 バックアップ

| ID | 内容 |
|---|---|
| B01 | 正常丸トリップ: export → restore で documents の行が一致 |
| B02 | sha256を1文字改変 → restore は reject、現行DBの件数は不変 |
| B03 | zipから manifest を消す → reject |
| B04 | integrity_check が失敗する壊れたdbを容器に入れたもの → reject |
| B05 | 復元前に `pre-restore-*.invbak` が1つ増える |
| B06 | 成功が15個目 → 日次は間引かれるが月末相当は残る（時計をモック） |
| B07 | 旧schema（将来002が入った世界で001ファイル）→ restore後にmigrateが走る |

B01〜B04 は一時ディレクトリで完結させ、実端末のファイルアプリを呼ばない。

### 9.5 画面（少なく、ゴールデンパスだけ）

- ホームから「前回と同じ」で editor に同じ行数が載る
- 明細0でも「PDFを送る」は押せる（0円請求を止めると、前金の調整で困る）
- 登録番号が不正なとき設定は保存でき、PDFは番号なし

E2E（Maestro / Detox）はv1では**入れない**。買い切り一人開発で赤く点き続ける端末E2Eは、税テストより先に捨てられる。

---

## 10. リスク

| リスク | 起きると | 設計側の先手 |
|---|---|---|
| HTML見積と実WebViewの折返し差 | 2枚PDF | 埋め込みフォント、安全係数、CI実焼、段階固定 |
| iOSが Files 共有を見せない | 「バックアップした」のにユーザーがファイルを見つけられない | セットアップ後の1回案内、バックアップ画面から共有シートで `.invbak` を外部へ送る |
| ユーザーがBackupsフォルダを手で消す | 復旧不能 | 送付のたびに書く、月末保持、Driveへ送る導線 |
| 機種変でフォルダを移さない | データ消失（競合と同じ結末） | 売りコピーと初回シートで「ファイルを自分で持つ」ことを先に言う。iCloudに任せたと書かない |
| WAL残でコピーが不完全 | バックアップが壊れる | checkpoint後にコピー、コピー先で integrity_check |
| リストア中に殺される | 中間状態 | 現行を `pre-restore` してから差し替え。失敗時は旧ファイルを戻す |
| 7ptでも45行超 | 拒否率の上昇 | 分割アクションを拒否画面に置く。2枚出力で黙って「成功」させない |
| 適格請求書の要件漏れ（取引年月日、税率ごと税額） | 受領側に突き返される | テンプレ必須要素をチェックリスト化し、欠落はプレビューに赤帯。ただし送信は止めない |
| 端数の商習慣差 | 「御社と1円違う」 | 設定で3方式。デフォルトfloor。過去帳票はスナップショットのroundingで再計算しない（bucket永続） |
| 源泉の例外（100万超、住民税特別徴収） | 誤額 | 100万超バナー。それ以外はv1対象外と設定に明記 |
| expo-print のWKWebView差 | 文字サイズがAndroidと違う | 実寸mm指定と埋め込みフォント。ptだけにしない |
| 買い切り980円でサポート負荷 | 「戻らない」問い合わせ | 復元UIをホームから3タップ以内、失敗理由を日本語で1文 |
| 空下書きが溜まる | 一覧がゴミ | 破棄スワイプを教える。自動削除はしない（消えたと誤認される） |
| 登録番号の誤入力 | 無効な適格請求書 | 形式だけ見る。送信は止めない。プレビューに番号を大きく出す |

---

## 11. 採用しなかった代替案

### 11.1 同期・保存

- **サーバー同期**: 売りと価格を壊す。衝突解消のUIが「1分」を殺す。
- **iCloud / Google Driveを正本にする**: 競合の失敗そのもの。補助の送り先にはしてよいが、正本は端末sqlite + `.invbak`。
- **JSONファイルを1帳票1ファイルでDocumentsに並べる**: 一覧と税率集計が遅く、部分的に消えたとき整合が取れない。バックアップ単位としても「どれが最新セットか」が分からない。
- **SQLiteを暗号化（SQLCipher）**: パスワードを忘れた瞬間に、売りが死ぬ。端末ロックに任せる。
- **毎日03:00のバックグラウンドバックアップ**: 実行されない日が静かに続く。起動時+送付直後の方が、ユーザーの体感「毎日」に一致する。

### 11.2 PDF

- **2枚以上を許可し、ページ番号を振る**: 競合への差別化を捨てる。プリンタとメール添付で「2枚目を見ていない」事故が起きる。
- **無段階スケール**: テスト不能。機種で境界が揺れる。
- **React Nativeビューをキャプチャ**: 印刷余白とフォントが制御不能。
- **固定行数（最大10行）**: 制作の請求は10行を超える。縮小4段階の方が実データに合う。
- **明細が多いとき自動で請求書を2枚に分割して連番**: 受領側の経理が「2枚目は別案件」と処理する。拒否してユーザーに分けさせる。

### 11.3 税・入力

- **税込入力をv1から両対応**: 逆算の端数が税率内訳と食い違い、説明UIが増える。税抜固定。
- **行ごとの消費税表示**: 適格請求書が求めるのは税率ごと。行税額は紙面を食い、合計と1円ずれる。
- **端数を毎回尋ねる**: 3タップ予算が死ぬ。設定に1回。
- **発行後イミュータブル + 訂正請求書**: 正しいが、スマホの誤タップ修正を不可能にする。v1は上書き編集 + `revised_at`。
- **品目マスタ必須**: 初回60秒を守れない。インライン生成。

### 11.4 画面

- **5タブ（品目を独立）**: 週1でしか開かないタブは、主ボタンから視線を奪う。
- **作成ウィザード（取引先→品目→確認→PDF）**: 各ステップが「戻る」を生む。1スクロール。
- **プレビュー専用ルート**: 編集とプレビューを往復するタップが無駄。モーダル。
- **起動ロック（Face ID必須）**: 請求書を出す行為自体を遅らせる。任意。

### 11.5 販売・データ

- **サブスク**: オフライン買い切りの信頼と合わない。
- **透かし付き無料版**: PDFの品位が売りなのに、最初の1枚を汚す。

---

## 12. 他の観点への反論・懸念

この節は、同じプロダクトを「データ保護」「単純さ」「税・法的正確さ」で最適化した設計と、本視点が衝突する点を先に書いておく。実装レビューで戻ってきたときに、UX側の拒否理由を探させないためである。

### 12.1 データ保護観点への反論

データ保護の最適化は、だいたい次を要求する。バックアップの暗号化、リストア時の複数回確認、起動時の生体認証、Filesに生sqliteを置かない、ハッシュだけでなく署名、バックアップをユーザーの目に触れない領域へ隠す。

**拒否する。** このプロダクトの失敗モードは漏洩より「戻らない」である。競合が既に証明している。

- **パスワード付きバックアップは、復元できないバックアップである。** 980円の帳票アプリに、ユーザーはパスマネージャを接続しない。2年後の機種変でパスワードを忘れ、中の請求書12ヶ月分が開けない。それは設計者の勝利（暗号は正しい）であり、ユーザーの敗北（データが消えた）である。端末のOSロックを境界にする。`.invbak` は平文sqliteを含む。そのリスクは「ファイルアプリに見える」という利益の対価であり、売りそのものでもある。
- **確認ダイアログを3回重ねない。** リストアは現行を消す操作なので慎重であるべきだが、慎重さは「何件が何件に置き換わるか」を1画面で見せることに使う。`本当によろしいですか？` を重ねると、読まれずに連打される。データ保護は情報量で担保し、タップ数では担保しない。
- **起動のFace IDをデフォルトにしない。** 請求書アプリの脅威モデルは、同居人より「電車で今すぐ送りたい」。毎回の生体は、共有シートまでの時間に必ず入る。任意設定で十分。
- **バックアップを不可視コンテナにしない。** 「安全に隠す」は、ユーザーがDriveにコピーできないことと同義である。見える名前、見える場所、見える時刻。改ざん検知はsha256で足りる。配布者が署名する世界（サーバーがある世界）ではない。
- **SecureStoreに暗号鍵を置く案は、機種変で鍵が死ぬ。** iCloudキーチェーンに逃がしても、iCloud障害の話に戻る。やらない。

データ保護側が正しく心配する点（端末売却前の残存、共有PCのFiles）は、設定に「データを消す」を1つ置き、バックアップファイルの扱いを一文で警告して閉じる。機能で塞がない。

### 12.2 単純さ観点への反論

単純さの最適化は、マスタを無くし、見積を無くし、バックアップを設定の最後の行に追い、ホームを「新規作成」ボタン1つにする。コードは短くなる。

**日常の2回目が遅くなる単純さは、複雑さである。**

- **「前回と同じ」と取引先チップは、画面要素としては余分でも、操作としては最短である。** 空フォームこそが複雑なUIだ。ユーザーは毎月同じ3行を、記憶を頼りに打ち直す。その記憶の負荷をUI側が引き取る。
- **見積を切ると、案件の始まりでアプリの外に出る。** 変換が1タップなら、見積は請求の下書きであり、別プロダクトではない。テーブルを分けないのもそのため。
- **バックアップを隠すと、売りが検証不能になる。** 単純なホームは美しいが、「本当に残っているか」が分からないアプリは、競合レビューの文面をそのまま買う。チップ1つの視覚重量は、消えた夜のサポートより安い。
- **品目タブを足さない代わりに、インライン生成とチップを足す。** 単純さ側が消しがちなのはマスタ画面であり、こちらも消す。残すのは再利用の入口だけである。
- **設定項目を削って端数をハードコードするのは賛成。** ただしハードコードする値は floor であり、切上げ法人向けに切り替えを1つ残す。単純さのために1円差で経理と揉める方が、画面は単純でも仕事は複雑になる。

単純さ側への譲歩として、v1でやらないものは多い。グラフ、タグ、複数税率のカスタム、複数事業（屋号を2つ）、英語PDF、ロゴ。それらはホームを汚す。再利用とバックアップ表示は「汚れ」ではなく主操作である。

### 12.3 税・法的正確さ観点への反論

税・法務の最適化は、適格請求書の記載事項を送信前に強制し、発行後の改訂を禁じ、端数処理の根拠条文をUIに出し、軽減税率対象かの自己証明を行ごとに取り、源泉の例外を全部実装し、訂正請求・返還請求の帳票を別種にする。

**正確さのうち、受領側が突き返すものだけを画面に出す。それ以外の正確さは、送信を遅くする。**

- **登録番号が空でも出す。** 免税事業者と、登録前の開業者が第一週間の顧客である。番号必須にすると、アプリは開業届より先に使えなくなる。番号が無いPDFは「適格請求書」だと自称しない。それ以上のブロックは、法律家の安心であって出し手の仕事を止める。
- **発行後も直せる。** 改竄耐性より、`110,000` を `11,000` に直して再送できることが、この価格帯のアプリの正義である。電帳法の保存要件をアプリが全部肩代わりすると、980円のローカルアプリではなくなる。日付と番号は残し、改訂時刻だけ持つ。
- **端数の説明を作成フローに出さない。** 「切り捨て（税率ごと）」を設定の補助テキストに書く。作成画面で消費税法施行令を引用しない。デフォルトが多数派なら、多数派は設定を開かない。
- **行ごとの税額を出さない。** 正確さ側は内訳の透明性を欲しがるが、適格請求書が求めるのは税率ごとの合計である。行税額を出すと、§9 T08 の1円差をユーザーが「バグ」と呼ぶ。
- **積上げ計算（行ごと税額の合計）をv1で両対応しない。** 法令上の選択肢でも、切替UIとテスト面が倍になり、デフォルト以外の経路で1円事故が起きる。必要になったら002で `tax_method` を足す。
- **源泉の例外を全部やらない。** 100万超バナーで止める。正確さ側から見ると不足。UX側から見ると、例外UIは対象外ユーザー全員の画面を汚染する。
- **「軽減8%」の対象品目かどうかは自己申告のトグルだけ。** 飲食料品判定の質問ツリーは、制作費しかないユーザーの明細にまで割り込む。

法務側が正しく勝つべき箇所もある。そこは譲る。

- 税率ごとの対象額と税額は、PDFと画面の両方に常時出す（隠さない）。
- 登録番号の形式は `T`+13桁以外を保存しない（空は可）。
- 過去帳票の数字は再計算で動かさない（bucket永続）。
- 2枚に見切れた適格請求書を「たぶん大丈夫」で出さない。1枚拒否の方が、記載事項の欠落より誠実である。

### 12.4 衝突が起きたときの裁定

実装中に三者が食い違ったら、次の順で切る。

1. **60秒・3タップを壊す変更は入れない**（保護の多重確認、作成ウィザード、必須登録番号）
2. **「戻らない」「2枚になる」を再発させる変更は入れない**（暗号化バックアップ、見積の自動2ページ）
3. **円が法令の税率ごと1回処理から外れる変更は入れない**（行積上げデフォルト、浮動小数）

1と2が衝突したら（例: リストアを速くするために検証を省く）、2を優先する。速さは作成フローの話であり、復元フローは「1回の確認で、壊れたファイルでは現状を触らない」が最短の正しい速さである。

---

## 13. v1の範囲と意図的な非範囲

### 入る

- 見積 / 請求、同一編集、見積→請求
- 取引先・品目（インライン生成 + 弱いマスタ）
- 適格請求書の登録番号、10%/8%、税率内訳、端数3方式（デフォルトfloor）
- 源泉徴収の単純トグル
- A4 1枚PDF（段階縮小、拒否、日本語フォント埋め込み）
- 共有シート送付
- 起動時・送付後・手動のバックアップ、1画面リストア、integrity
- ホームの3タップ経路とバックアップチップ

### 入らない

- サーバー、アカウント、サブスク、広告
- iCloud/Drive自動同期（手動で `.invbak` を送るのは可）
- ロゴ、複数テンプレ、英語、インボイス以外の帳票（納品書、領収書）
- 入金消込の銀行連携、リマインド通知
- 複数事業、複数税率カスタム、税込入力
- 発行後の訂正請求書、電帳法タイムスタンプ
- 起動必須ロック、暗号化バックアップ
- グラフ、タグ、プロジェクト、時間記録

領収書とロゴは「送る」を速くしないので、売りが定着してからでよい。

---

## 14. 実装時に先に書くべきファイル

実装を始めるなら、画面より先にこの順で赤を出す。

1. `src/domain/tax.ts` + `testdata/tax/*.json`
2. `src/layout/chooseStage.ts` + `testdata/layout/*.json`
3. `src/db/migrations.ts`（001）
4. `src/backup/exportBackup.ts` / `restoreBackup.ts` の丸トリップテスト
5. その後にホームと editor

税と1枚と復元が先に緑なら、このアプリの売りはもう存在する。画面は、その3つを60秒で触らせるための皮である。
