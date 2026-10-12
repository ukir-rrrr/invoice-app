# 請求・見積アプリ v1 設計書

**対象**: Expo (React Native, TypeScript, expo-router) / iOS・Android  
**製品方針**: オフライン完結・端末内データのみ・「消えない・必ず戻せる」を最大の差別化  
**販売**: ワンタイム 980〜1,500 円（ストア課金）

---

## 1. 設計の核となる判断

| 判断 | 内容 |
|------|------|
| **信頼の単位** | ユーザーが触れる「日次バックアップファイル」＋アプリ内の SQLite。クラウド同期は v1 では行わない。 |
| **PDF** | HTML テンプレート + `expo-print` で生成。レイアウトは **常に 1 枚 A4** をアルゴリズムで保証する。 |
| **税** | 明細行ごとの税率（10% / 8% 軽減）と、**端数処理モード**（切捨て / 切上げ / 四捨五入）を請求書単位で保持し、再計算可能な形で保存する。 |
| **適格請求書** | 登録番号（T + 13 桁）を発行者プロフィールに保持し、PDF とプレビューに必ず表示する。 |

競合で多い「突然の全データ消失」「iCloud 復元失敗」「2 枚目にレイアウトがはみ出す」に対し、**ローカル DB の単一ソース + 検証付きエクスポートバックアップ + 1 ページ PDF 保証**で正面から解く。

---

## 2. ライブラリ選定と理由

### 2.1 必須（提案スタックを採用）

| ライブラリ | 用途 | 採用理由 |
|------------|------|----------|
| **expo-sqlite** | 永続データ | Expo 公式、同期 API（`openDatabaseSync`）とマイグレーションをアプリ側で完全制御できる。Realm 等より SQL がバックアップ・検証・デバッグに向く。 |
| **expo-print** | PDF 生成 | `printToFileAsync` で WebView ベースの HTML→PDF。日本語フォントはテンプレ内 `@font-face` + バンドル TTF で固定。 |
| **expo-sharing** | 共有シート | PDF・バックアップ ZIP のユーザー明示共有。 |
| **expo-file-system** | バックアップ I/O | `documentDirectory` / SAF 連携、`copyAsync`、`getInfoAsync` でサイズ・存在確認。 |
| **expo-router** | 画面遷移 | ファイルベースルート、深いリンクは v1 最小（請求書 ID のみ）。 |
| **zod** | 入力・インポート検証 | バックアップ JSON / 手動入力のスキーマ統一。 |
| **date-fns** + **date-fns-tz** | 日付 | タイムゾーン明示（`Asia/Tokyo`）で請求日・支払期限のずれを防ぐ。 |
| **react-hook-form** | フォーム | 明細行の動的追加とバリデーション。 |

### 2.2 補助

| ライブラリ | 用途 | 理由 |
|------------|------|------|
| **@react-native-async-storage/async-storage** | 設定・メタのみ | DB パス、最終バックアップ日時、オンボーディング完了フラグ。**取引データは入れない**。 |
| **react-native-safe-area-context** | UI | 標準。 |
| **expo-crypto** | 整合性 | SHA-256（バックアップ manifest、オプションでファイル全体ハッシュ）。 |
| **fflate**（または **pako**） | ZIP | 純 JS、バックアップを `db + manifest + checksums` の ZIP にまとめる。ネイティブ依存を増やさない。 |

### 2.3 意図的に v1 で使わないもの

- **WatermelonDB / RxDB**: 同期・リアクティブは過剰。バックアップ整合性の説明が難しくなる。
- **react-native-pdf / ネイティブ PDF 描画**: 1 ページ収束の試行錯誤が HTML/CSS + 計測ループの方が速い。
- **iCloud / Google Drive API 直接**: 失敗時の説明責任がアプリに乗る。v1 は「Files / 共有フォルダに**書き出す**」に限定し、同期は OS とユーザーに委ねる。
- **redux / zustand（グローバル）**: 画面ローカル + SQLite 再読込で十分。グローバルキャッシュは復元後の不整合リスク。

---

## 3. データ表現

### 3.1 ドメイン ID

- 全エンティティ: **UUID v4** 文字列（`TEXT PRIMARY KEY`）。
- 人間向け番号（請求書番号など）は別カラムで採番し、ユニーク制約は `(issuer_profile_id, fiscal_year, sequence)` 等で管理。

### 3.2 金額の内部表現

- **整数: 円単位の `INTEGER`**（浮動小数点は禁止）。
- 税率は **パーセント整数**（`10`, `8`）または **basis points**（`1000`, `800`）のどちらかに統一 → 本設計では **`tax_rate_percent INTEGER`**（8 または 10）。
- 端数処理: 請求書（見積）単位で `rounding_mode ENUM('floor','ceil','round')` を保存。

### 3.3 ドキュメント種別

- `document_kind`: `'quote' | 'invoice'`
- 見積→請求変換: 新規 `invoice` 行を作成し、`source_quote_id` を参照。見積は `status = 'converted'` に更新（削除しない）。

### 3.4 スナップショット vs 再計算

- **明細行**に `unit_price_excl_tax`, `quantity`, `tax_rate_percent` を保存。
- **集計フィールド**（小計・税額・合計）は DB に保存するが、保存前・PDF 生成前に **必ず同一関数で再計算**し、不一致なら保存拒否（ゴールデンテストの基準関数と同一）。

### 3.5 バックアップファイル形式（v1）

```
backup_YYYYMMDD_HHmmss.zip
├── manifest.json      # バージョン、作成日時、アプリビルド、チェックサム一覧
├── data.sqlite        # DB ファイルのコピー（または SQL ダンプ — 下記で SQLite コピーを推奨）
└── manifest.sig       # 任意 v1.1: HMAC（v1 は manifest 内 sha256 のみで十分）
```

**manifest.json 例（概念）:**

```json
{
  "backup_format_version": 1,
  "app_semver": "1.0.0",
  "schema_version": 3,
  "created_at": "2026-10-12T14:30:00+09:00",
  "timezone": "Asia/Tokyo",
  "files": {
    "data.sqlite": { "sha256": "...", "size_bytes": 12345 }
  },
  "record_counts": { "clients": 10, "invoices": 42 }
}
```

復元時: ZIP 展開 → manifest 検証 → SHA-256 照合 → **別パスに DB を置いて PRAGMA integrity_check** → 成功後に atomic rename で本番 DB と差し替え。

---

## 4. SQL スキーマとマイグレーション

### 4.1 マイグレーション方式

- `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)` テーブル。
- アプリ起動時: 現在 `user_version`（または自前 `schema_migrations`）とコード内 `LATEST_SCHEMA = 3` を比較し、**未適用分のみ**順次 `migration_00N.sql` 相当を実行。
- 各マイグレーションは **単一トランザクション**。失敗時はロールバックし、起動画面で「DB 更新失敗・バックアップから復元」を提示。
- **ダウングレードは非対応**。古いバックアップを新しいアプリで開くときは、manifest の `schema_version` がアプリ対応範囲内かチェック。

### 4.2 テーブル定義（schema v3）

```sql
-- v1: 発行者（自分の事業者情報・適格請求書登録番号）
CREATE TABLE issuer_profile (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  registration_number TEXT,          -- T + 13 桁、NULL 可（未登録時は PDF に注意文言）
  postal_code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  phone TEXT,
  email TEXT,
  default_payment_terms_days INTEGER NOT NULL DEFAULT 30,
  default_rounding_mode TEXT NOT NULL DEFAULT 'floor'
    CHECK (default_rounding_mode IN ('floor','ceil','round')),
  bank_name TEXT,
  bank_branch TEXT,
  bank_account_type TEXT,
  bank_account_number TEXT,
  logo_uri TEXT,                     -- documentDirectory 相対パス
  updated_at TEXT NOT NULL
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  honorific TEXT DEFAULT '御中',
  postal_code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  email TEXT,
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  default_unit TEXT DEFAULT '式',
  default_unit_price_excl_tax INTEGER NOT NULL,
  default_tax_rate_percent INTEGER NOT NULL CHECK (default_tax_rate_percent IN (8, 10)),
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 見積・請求の共通ヘッダ
CREATE TABLE sales_documents (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quote','invoice')),
  status TEXT NOT NULL,              -- draft | issued | paid | void | converted (quote only)
  document_number TEXT NOT NULL,     -- 表示用番号
  client_id TEXT NOT NULL REFERENCES clients(id),
  issue_date TEXT NOT NULL,          -- ISO date
  due_date TEXT,                     -- 請求のみ必須（アプリ層で検証）
  title TEXT,
  notes TEXT,
  rounding_mode TEXT NOT NULL CHECK (rounding_mode IN ('floor','ceil','round')),
  subtotal_excl_tax INTEGER NOT NULL,
  tax_8_amount INTEGER NOT NULL DEFAULT 0,
  tax_10_amount INTEGER NOT NULL DEFAULT 0,
  total_incl_tax INTEGER NOT NULL,
  source_quote_id TEXT REFERENCES sales_documents(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (document_number)
);

CREATE TABLE sales_document_lines (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES sales_documents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  item_id TEXT REFERENCES items(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_price_excl_tax INTEGER NOT NULL,
  tax_rate_percent INTEGER NOT NULL CHECK (tax_rate_percent IN (8, 10)),
  line_subtotal_excl_tax INTEGER NOT NULL,  -- quantity * unit_price、円整数化後
  UNIQUE (document_id, sort_order)
);

-- 採番（年度単位の連番）
CREATE TABLE document_sequences (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quote','invoice')),
  fiscal_year INTEGER NOT NULL,      -- 4月始まり会計年度 or 暦年 — v1 は暦年で単純化
  last_sequence INTEGER NOT NULL,
  UNIQUE (kind, fiscal_year)
);

-- バックアップ・復元の監査（ユーザーが「いつ戻したか」を確認）
CREATE TABLE backup_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('export_auto','export_manual','restore_success','restore_failed')),
  file_name TEXT,
  manifest_sha256 TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
```

### 4.3 マイグレーション履歴（例）

| Version | 内容 |
|---------|------|
| 1 | 初期スキーマ（issuer, clients, items, sales_documents, lines, sequences） |
| 2 | `backup_events` 追加、`sales_documents.status` CHECK 拡張 |
| 3 | `issuer_profile.logo_uri`、インデックス `sales_documents(client_id)`, `lines(document_id)` |

新規インストールは v3 まで一括適用。既存ユーザーは 1→2→3 を順に実行。

---

## 5. 主要アルゴリズム

### 5.1 消費税計算と端数処理

**前提（v1）**: 明細ごとに税抜単価×数量で行小計（円整数）、税率ごとに税抜合計を集計し、**税率バケット単位で税額を算出**する（請求書に一般的な「税率ごとの合計」表示に合わせる）。

```
function roundMoney(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'floor': return Math.floor(value);
    case 'ceil':  return Math.ceil(value);
    case 'round': return Math.round(value);
  }
}

function computeDocumentTotals(lines, roundingMode): Totals {
  let subtotal8 = 0, subtotal10 = 0;
  for (const line of lines) {
    const lineExcl = roundMoney(line.quantity * line.unit_price_excl_tax, roundingMode);
    if (line.tax_rate_percent === 8) subtotal8 += lineExcl;
    else subtotal10 += lineExcl;
  }
  const tax8  = roundMoney(subtotal8 * 0.08, roundingMode);
  const tax10 = roundMoney(subtotal10 * 0.10, roundingMode);
  return {
    subtotal_excl_tax: subtotal8 + subtotal10,
    tax_8_amount: tax8,
    tax_10_amount: tax10,
    total_incl_tax: subtotal8 + subtotal10 + tax8 + tax10,
  };
}
```

**行小計の丸め**: 数量×単価は **請求書の `rounding_mode` を行ごとに適用**（v1 固定。将来「行ごと内税」モードは別フラグ）。

**適格請求書の表示要件（PDF）**:

- 登録番号（T13 桁）
- 税率ごとの課税対象額と消費税額（8% / 10%）
- 取引日（発行日）・宛名・金額

**税込単価入力**は v1 非対応（税抜のみ）— UI 文言で明示し、サポート問い合わせを減らす。

### 5.2 1 枚 A4 PDF 保証アルゴリズム

**方針**: 固定枠（ヘッダ・フッタ・合計ブロック）＋可変明細テーブル。明細行数と備考長に応じて **段階的に CSS 変数を縮小**し、それでも収まらない場合は **明細フォントと行パディングの下限**まで落とし、下限でもオーバーフローするなら **保存/PDF 生成をブロック**しユーザーに「行を分割するか備考を短く」と表示（2 枚目は出さない）。

**手順**:

1. HTML テンプレートに `@page { size: A4; margin: 12mm; }`、`.page { height: 297mm; box-sizing: border-box; overflow: hidden; }`。
2. 明細最大行数 `N`（v1: 20 行ソフト、25 行ハード）をフォームで警告。
3. PDF 生成前に **オフスクリーン WebView**（`expo-print` と同一エンジン）で HTML をロード。
4. 縮小レベル `L = 0..K` の離散ステップ（例: ベースフォント 10pt → 9 → 8 → 7.5 → 7）。
5. 各 `L` で `document.body.scrollHeight` と `clientHeight`（または注入 JS で `.page` の `getBoundingClientRect`）を比較。
6. 収まる最大の `L` を選択。どの `L` でも `scrollHeight > pageHeight` なら **LayoutError**。
7. 備考は最大文字数（例: 400 文字）と `line-clamp`（縮小段階で行数減）。

**Jest 側**: DOM は **jsdom** で完全再現しない。代わりに **行高モデル**（`baseRowPx * rowCount + fixedHeaderFooterPx <= A4_CONTENT_PX`）の純関数と、本番と同じステップ表をゴールデン化。実機では PDF スモークのみ（CI 外）。

### 5.3 日次自動バックアップ・復元・整合性

**スケジュール**:

- `expo-background-fetch` + `TaskManager`（iOS/Android ともベストエフォort）。**追加で**アプリ foreground 起動時に「前回から 24h 経過」なら即エクスポート。
- ユーザー設定: 自動バックアップ ON/OFF、保存先（iOS: アプリの `Documents/backups/` を Files に公開、Android: `StorageAccessFramework` で一度フォルダを選び URI を persist）。

**エクスポート手順**:

1. SQLite `PRAGMA wal_checkpoint(FULL)` で WAL をメイン DB に反映。
2. `documentDirectory` 下に一時 `data.sqlite` を **ファイルコピー**（VACUUM INTO が使えればより安全）。
3. manifest 生成 + SHA-256。
4. ZIP 作成 → 最終ファイル名 `invoice_backup_YYYYMMDD_HHmmss.zip`。
5. 保存先に書き込み。古い自動バックアップは **直近 7 日分を保持**しそれ以前を削除（設定で 14/30 に変更可）。
6. `backup_events` に記録。

**復元手順（破損安全）**:

1. ユーザーが ZIP を選択（Document Picker）。
2. 一時ディレクトリに展開。manifest とファイルサイズ・SHA-256 検証。
3. `data.sqlite` を `SQLite.openDatabaseSync('restore_candidate.db')` で開き `PRAGMA integrity_check`（結果が `ok` 以外は中止）。
4. スキーマバージョンが `MIN_SUPPORTED_SCHEMA..LATEST_SCHEMA` 内か確認。
5. 本番 DB 接続を閉じ、既存 DB を `data.sqlite.bak.<timestamp>` に rename（**失敗しても元が残る**）。
6. 候補を本番パスに `move`。
7. アプリ再起動または DB ハンドル再初期化。`backup_events` に `restore_success`。
8. いずれかの手順で失敗: 候補削除、`.bak` があればロールバック手順を設定画面に表示。

**iCloud との関係**: アプリは iCloud バックアップを「禁止」しないが、**推奨復元経路は自アプリの ZIP のみ**とオンボーディングで説明。iCloud 全体復元は Apple の仕様依存であり保証しない。

---

## 6. 画面フロー（expo-router）

```
app/
  _layout.tsx          # ルート、DB 初期化、マイグレーション、バックアップ起動チェック
  (tabs)/
    _layout.tsx
    index.tsx          # ホーム: 最近の請求・見積、バックアップ状態バナー
    documents.tsx      # 一覧（フィルタ: 見積/請求/下書き）
    clients.tsx        # 取引先一覧
    settings.tsx       # 発行者情報、税・端数、バックアップ、復元
  document/
    [id].tsx           # 詳細・プレビュー・PDF 共有
    new.tsx            # 新規（query: kind=quote|invoice）
    edit/[id].tsx      # 編集
  client/
    [id].tsx
    new.tsx
  item/
    index.tsx          # 品目一覧（設定タブからも）
    [id].tsx
  backup/
    restore.tsx        # 復元ウィザード（検証結果表示）
  onboarding/
    index.tsx          # 初回: 発行者情報・登録番号・自動バックアップ推奨
```

**主要フロー**:

1. 初回起動 → オンボーディング → 発行者登録 → 自動バックアップ ON 推奨 → ホーム。
2. 取引先登録 → 品目登録（任意）→ 見積作成 → 発行 → PDF 共有。
3. 見積詳細 → 「請求書に変換」→ 請求ドラフト（日付・支払期限確認）→ 発行。
4. 設定 → 今すぐバックアップ / バックアップから復元 / 最終成功日時表示。

**エラー UX**: バックアップ 24h 以上未実行はホームに黄色バナー。復元失敗は原因コード（`HASH_MISMATCH`, `INTEGRITY_FAIL`, `SCHEMA_TOO_NEW`）を人間語に変換。

---

## 7. モジュール構成

```
src/
  db/
    connection.ts       # open, close, transaction helper
    migrations/         # 001_initial.ts, 002_...
    repositories/       # clientsRepo, documentsRepo, ...
  domain/
    tax.ts              # computeDocumentTotals, roundMoney
    documentNumbers.ts  # 採番
    quoteToInvoice.ts   # 変換ルール
    layoutScale.ts      # A4 収まり判定（純関数）
  backup/
    export.ts
    import.ts
    manifest.ts
    scheduler.ts
  pdf/
    template.ts         # HTML 文字列生成
    render.ts           # expo-print ラッパ、scale 探索
  validation/
    schemas.ts          # zod
    registrationNumber.ts # T + 13 桁チェックデジット（国税庁形式）
  ui/
    components/
    screens/            # 必要なら tabs から切り出し
  hooks/
    useDocuments.ts
    useBackupStatus.ts
```

**依存方向**: `ui → hooks → repositories → domain`。**domain は db/ui に依存しない**（テスト容易性）。

**トランザクション境界**: 請求書保存は `sales_documents` + `lines` を 1 トランザクション。変換は「新 invoice 挿入 + quote status 更新」を 1 トランザクション。

---

## 8. テスト戦略

### 8.1 Jest（CI 必須）

| 領域 | 手法 |
|------|------|
| **税・端数** | ゴールデン JSON: 入力 lines + roundingMode → 期待 totals。8%/10% 混在、境界（1 円、大量行）。 |
| **レイアウト** | `layoutScale.ts` のステップ表: `(rowCount, notesLength) → scaleLevel | ERROR`。競合回帰「2 ページ化」を行数上限テストで担保。 |
| **登録番号** | 有効/無効 T13 桁の表形式テスト。 |
| **manifest** | 改ざん ZIP で `verifyManifest` が失敗すること。 |
| **採番** | 年度切替で sequence が 1 に戻る。 |

### 8.2 結合・手動

- **expo-sqlite**: 開発ビルドでマイグレーション 1→3 のインメモリまたは一時ファイル。
- **PDF**: 実機スモーク（5 行 / 15 行 / 25 行）で目視 1 枚。スクリーンショットはリリース前チェックリスト。
- **復元**: バックアップ → アプリ削除相当（DB ファイル削除）→ 復元 → 件数一致。

E2E（Detox）は v1 では **クリティカルパス 1 本**（請求作成→PDF）のみ検討。工数対効果が低ければ手動リリースゲートで代替。

---

## 9. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Background Fetch が動かない | 自動バックアップ漏れ | Foreground 24h チェック + バナー + 手動バックアップ |
| OS がアプリデータ削除 | 全損 | ZIP を Files 外へユーザーに案内（共有フォルダ/Drive 手動コピー） |
| PDF フォント欠け | 文字化け | フォント同梱、テンプレ内 @font-face のみ |
| 税率・制度変更 | 表示不備 | 税率は行に保存（過去 PDF 再生成は保存 HTML スナップショット v2 検討） |
| 大容量 DB の ZIP 失敗 | バックアップ失敗 | エラー通知、分割バックアップは v2 |
| Android SAF URI 失効 | 自動保存失敗 | 保存先再選択フロー、失敗を `backup_events` に記録 |
| 端数処理のユーザー期待差 | 会計不一致 | 設定で明示、プレビューに税内訳、ヘルプに例示 |

---

## 10. 採用しなかった代替案

| 代替 | 不採用理由 |
|------|------------|
| **iCloud / Google 同期を一次手段** | 競合と同じ復元失敗クレームを引き受ける。v1 の差別化と逆行。 |
| **JSON のみバックアップ（DB なし）** | 大規模データと参照整合性、復元速度で SQLite 単一ファイルに劣る。 |
| **SQL ダンプテキスト** | 復元時のパースエラーと部分適用リスク。バイナリコピー + integrity_check が堅い。 |
| **2 ページ PDF 許容** | 差別化要件に反する。収まらない場合はユーザーに編集を要求。 |
| **税込入力デフォルト** | 実装とテストが倍化。フリーランス向けは税抜請求が多い。 |
| **サブスク** | 信頼・オフライン商品は買い切りの方がストア評価と合致。 |
| **Expo Go 本番** | SQLite パス・バックアップ・Background に制約。本番は dev client / EAS Build。 |

---

## 11. 他の観点への反論・懸念

本設計は **バランス型**（データ保護・実装単純性・税務の実務正しさ・UX のいずれかに偏りすぎない）を意図している。他観点から出やすい論点への応答を以下に示す。

### 11.1 「データ保護を最大化する」観点からの批判

- **批判**: 日次 ZIP だけでは、アプリ起動中のクラッシュや端末紛失までのギャップで失う可能性がある。WAL のリアルタイムミラー、iCloud Drive 自動同期、複数世代の冗長化が必要。
- **反論**: v1 でリアルタイム同期を入れると、競合と同様に「同期の失敗＝データが消えたように見える」問題を自前で抱える。**ユーザーが Files で見える ZIP**は信頼の心理価値が高く、整合性チェックも説明しやすい。ギャップ対策は **編集操作後のデバウンス付きミニエクスポート（v1.1）** で足せるが、v1 は日次 + foreground 24h + 手動で十分な市場投入速度を優先する。冗長 7 世代はストレージ圧迫と Android SAF の書き込み失敗率を上げるため、デフォルト 7 日とする。

### 11.2 「とにかくシンプルに」観点からの批判

- **批判**: manifest、ZIP、マイグレーション、レイアウト二分探索は過剰。AsyncStorage + CSV エクスポートで十分。
- **反論**: 競合クレームの中心は **「復元したら空」** と **「明細が多いと壊れる」**。CSV は参照整合性と税率混在の再入力コストが高く、**復元の信頼**を売れない。マイグレーションはリリース後の必須コストであり、初期から入れない方が総工数が増える。レイアウトは HTML 固定 1 枚が UX の核なので、縮小ステップ表程度の複雑さは許容する。

### 11.3 「税務・法務を厳密に」観点からの批判

- **批判**: 行単位の税計算方式（内税/外税、按分、免税）を選べないと実務で使えない。登録番号の検証だけでは適格請求書の全要件を満たさない。
- **反論**: v1 は **フリーランスの典型的パターン（税抜明細・8/10% 混在・税率別合計・端数処理選択）** にスコープを切る。免税・インボイス特例の細部はヘルプと「税理士確認」免責で補う。**過去書類の税率は行に固定**し、将来の制度変更と切り離す。内税・複数按分は v2 で `tax_calculation_mode` を足す余地をスキーマコメントに残すが、v1 で全方式を載せるとテストと UX が破綻する。

### 11.4 「UX 最優先」観点からの批判

- **批判**: 25 行で PDF 拒否は使い勝手が悪い。2 ページにすべき。バックアップをユーザーに意識させるのはストレス。
- **反論**: 2 ページ許容は **印刷・送付の実務**（1 枚想定の相手方）と競合レビューで明確に嫌われている。**拒否ではなく、事前の行数警告と縮小プレビュー**で大部分を解消し、どうしても超える場合のみ「書類を分割」提案する。バックアップは **デフォルト ON・ほぼ自動**にし、設定画面以外では成功時トーストのみ。復元は障害時だけ使う想定でウィザード化し、日常 UX を汚さない。

### 11.5 本設計のトレードオフの明示

- **守ったもの**: オフライン、検証付き復元、1 枚 PDF、買い切りに合う保守範囲。
- **捨てたもの（v1）**: リアルタイムクラウド同期、税込デフォルト、無制限行数 PDF、Web 版。
- **次の杠杆**: 編集後ミニバックアップ、PDF HTML スナップショット保存、内税モード、請求書メール下書き連携（いずれもサーバなし範囲で検討）。

---

## 12. v1 完了の受け入れ基準（要約）

1. 機内モードで請求書作成〜PDF 出力〜共有まで完結する。
2. 適格請求書登録番号が PDF に表示され、8%/10% の税額内訳が合計と一致する（ゴールデンテスト全 pass）。
3. 明細 20 行・標準備考で PDF が 1 枚に収まる（実機確認）。収まらないケースで明確なエラー。
4. 自動または手動バックアップ ZIP を復元し、取引先・書類件数が一致する。改ざん ZIP は拒否される。
5. DB マイグレーション後も既存バックアップから復元可能（サポート schema 範囲内）。

---

*Document version: 1.0 — 設計のみ。実装は本書の `LATEST_SCHEMA = 3` およびバックアップ format version 1 に従う。*
