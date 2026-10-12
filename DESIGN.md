# 請求書アプリ v1 設計書（簡潔さ）

**視点:** ソロ開発者が出荷し、一人で保守できる最小設計。v1 に必須でないものは切る。  
**プロダクト:** 日本のフリーランス・小規模事業者向け、オフライン完結の請求書・見積書アプリ（Expo / React Native / TypeScript / expo-router）。  
**売り:** データが消えない。いつでも自分の手で戻せる。A4 1枚からハミ出さない。  
**非ゴール:** 会計ソフト、売掛管理、クラウド同期、電子帳簿保存法対応、税理士監修済みの「法令完全準拠」表明。

本文中の「しない」「切る」は先送りではなく、v1 の意図的な拒否である。

---

## 1. 設計原則（これ以外の原則は持たない）

1. **やり方は1つ。** 税率計算も丸めもバックアップ形式も、設定で分岐しない。
2. **ソース・オブ・トゥルースは SQLite 1本。** 画面状態はそこに対する薄いキャッシュに過ぎない。
3. **金額は整数円。** IEEE 754 も decimal ライブラリも使わない。
4. **測定より計算。** PDF が1枚に収まるかは実行時レイアウト測定ではなく、決定論的な高さモデルで保証する。
5. **ユーザーが見える場所に、ユーザーが開けるファイルを置く。** iCloud の「たぶんバックアップされている」は競合の失敗理由そのものなので採用しない。
6. **画面はルートと1対1。** ビジネスロジックは `app/` に置かない。
7. **依存は説明できるものだけ。** 「将来使うかも」で入れない。

出荷判定は機能数ではなく、次の3つが壊れないこと。

- 発行した請求書の税額が、後から再計算しても同じ整数になる。
- 明細が増えても PDF が2枚目を生まない（収まらなければ発行できない）。
- 昨日のバックアップから、検証付きで今日の DB を置き換えられる。

---

## 2. ライブラリ選定

Expo SDK は `package.json` でピン留めし、v1 期間中はメジャーを上げない。New Architecture は Expo のデフォルトに従う（独自に切らない）。

### 2.1 採用（理由つき）

| ライブラリ | 役割 | 採用理由 |
|---|---|---|
| `expo-router` | 画面と URL | ファイルがルート。画面数を物理的に制限できる。 |
| `expo-sqlite` | 永続化 | 提案どおり。単一ファイル、WAL、SQL がそのままバックアップ対象になる。同期 API（`openDatabaseSync`）を使い、リポジトリを直線的に書く。 |
| 自前の HTML テンプレート + `expo-print` | PDF | ネイティブ描画や `pdf-lib` の座標計算より、テンプレート1枚の方がソロで直せる。`printToFileAsync` に A4 の width/height を明示してページングを抑止する。 |
| `expo-sharing` | 共有シート | PDF とバックアップファイルを「メール / Files / Drive」へ渡すだけ。自前の共有 UI は持たない。 |
| `expo-file-system` | バックアップ I/O | 一時ファイル → 検証 → rename の原子書き込みに使う。 |
| `expo-crypto` | SHA-256 | バックアップ改ざん・途中切れ検出。自前ハッシュは書かない。 |
| `expo-document-picker` | 復元ファイル選択 | ユーザーが Files / ストレージから `.invbak` を選ぶ。 |
| React Native `AppState` | 日次バックアップの起動 | バックグラウンドタスクより「今日開いたら取る」。iOS が殺す系 API に賭けない。 |
| Jest（Node 環境） | 税・レイアウト・バックアップのゴールデン | 実機 PDF ピクセル比較は v1 では持たない。 |

設定の数行は `settings` テーブルに置く。`AsyncStorage` も `expo-secure-store` も **入れない**。

UI は `StyleSheet` とコンポーネント4つ（`Button` / `Field` / `LineEditor` / `Confirm`）で足りる。デザインシステムを導入しない。

日付は `Intl` と `lib/date.ts` の数関数。`date-fns` は入れない。

### 2.2 課金

**有料アプリ（買い切り）1,280円。アプリ内課金は実装しない。**

980–1,500円の中央を取り、IAP・リストア購入・レシート検証・RevenueCat を丸ごと切る。再インストール後も「買った」はストア側のアプリ所有で足りる。無料お試しは「データが消えない」体験と相性が悪い（試用期間終了で Ambiguous になる）のでやらない。

### 2.3 明示的に入れないもの

- ORM（Drizzle / Prisma）— マイグレーションと型を二重管理する。テーブルは5つで十分。
- WatermelonDB / Realm — 同期前提の複雑さを買う理由がない。
- 状態管理（Zustand / Redux / TanStack Query）— サーバーがない。
- NativeWind / Tamagui — ビルドパイプラインを増やす。
- `react-pdf` / `pdf-lib` / ネイティブ PDF 描画 — A4 保証を「座標」で解くとテンプレート変更が苦痛。
- i18n — 日本語専用。
- Sentry / 分析 — オフライン売りと矛盾するし、個人請求データが飛びうる。
- `expo-notifications` / バックグラウンドフェッチ必須の日次処理。
- SQLCipher / 生体認証ロック。

---

## 3. データの表現

### 3.1 金額

- 通貨は JPY のみ。すべての金額カラムは `INTEGER`（円）。
- 単価は **税抜** で持つ。税込は表示用の派生値。
- 数量は **正の整数**。1.5時間のような小数数量は持たない。時間精算は「数量1・単価を税抜合計にする」か、行を分ける。
- 画面表示は `¥1,234`（`Intl.NumberFormat('ja-JP')`）。計算経路に文字列を通さない。

税込から税抜を入れたい操作だけ、品目フォームに補助を置く。

```
unit_price_ex = Math.floor(incl * 100 / (100 + rate))
```

この一行以外に「税込モード」は存在しない。

### 3.2 日付時刻

- 発行日・支払期限は **ローカル暦日** `YYYY-MM-DD`。タイムゾーン換算しない。
- `created_at` / `updated_at` は UTC の ISO 8601。ソートとバックアップ用。人間向けには出さない。

### 3.3 書類

見積と請求は **同一テーブル**。`kind` が `'quote' | 'invoice'`。別テーブルにすると変換がコピー地獄になる。

状態は2つだけ。

| status | 意味 |
|---|---|
| `draft` | 編集可。番号なし。 |
| `issued` | 番号確定。ヘッダと明細は凍結。削除せず `archived_at` で一覧から隠す。 |

「送った」「入金済み」は持たない。請求書アプリであり債権アプリではない。

発行時にスナップショットする。

- 宛先（名称・敬称・郵便番号・住所）
- 発行者（名称・住所・TEL・登録番号）
- 振込先は **表示用の1本の文字列**（`bank_snapshot`）。発行後に口座を変えても過去 PDF と DB が一致する。

マスター（`clients` / `items` / `settings`）を後から直しても、発行済み書類は動かない。下書きは `client_id` を持ち、編集画面を開いたときにマスターから再読込してよい。

### 3.4 番号

発行時に初めて振る。

- 見積: `QUO-2026-0001`
- 請求: `INV-2026-0001`

採番は `settings.quote_seq` / `invoice_seq` と `seq_year`。年が変わったら seq を 0 に戻す。単一ユーザー・単一プロセスなので `MAX + 1` の競合は考えない。欠番は気にしない（発行に失敗したらシーケンスは戻さない。戻すと再利用でより危険）。

### 3.5 適格請求書発行事業者登録番号

- 形式: `T` + 数字13桁。正規表現 `/^T[0-9]{13}$/` のみ。
- 空を許す（免税事業者の見積・請求。テンプレートは登録番号行を出さない）。
- チェックデジットも国税庁への実在確認もしない。サーバーがない。

### 3.6 税率

v1 が知る税率は **8 と 10 だけ**。非課税・不課税・0%・経過措置は切る。対象ユーザー（デザイン・開発・コンサル等）の行のほぼ全部が10%であり、軽減は「茶菓を立て替えた」程度をカバーすればよい。

軽減税率対象行には表示上 `※` を付け、欄外に「※は軽減税率対象（8%）」と書く。これが適格請求書の「軽減税率対象である旨」の最小実装。

### 3.7 見積 → 請求

発行済み見積に対し、新しい `invoice` / `draft` を INSERT する。行をコピーし `source_quote_id` を張る。発行日は今日、支払期限は今日 + `default_due_days`。変換は一方通行。請求を見積に戻さない。同じ見積から二度変換してよい（再請求の下書き）。

### 3.8 削除方針（「消えない」との折り合い）

- 下書き: ハードデリート可（確認ダイアログ1つ）。
- 発行済み: ハードデリート禁止。`archived_at` のみ。バックアップにも残る。
- 取引先・品目: ハードデリート可。発行済み書類はスナップショット済みなので参照整合は `ON DELETE SET NULL`。

ゴミ箱も Undo スタックも作らない。

---

## 4. SQL スキーマとマイグレーション

### 4.1 方針

- 主キーは `INTEGER PRIMARY KEY AUTOINCREMENT`。同期しないので UUID はノイズ。
- 外部キー有効（`PRAGMA foreign_keys = ON`）。
- WAL（`PRAGMA journal_mode = WAL`）。
- 複数行更新は必ず1トランザクション。
- v1 のスキーマは **マイグレーション 001 の1本**。001 を後から編集しない。

ランナー（`lib/db/migrate.ts`）:

1. `schema_migrations` が無ければ作る。
2. 適用済み `version` を読む。
3. 未適用ファイルを番号順に、1ファイル1トランザクションで適用し、`schema_migrations` に挿入する。
4. 失敗したらそのトランザクションを ROLLBACK し、起動を中止して「バックアップから復元」を出す。

`PRAGMA user_version` は使わない。履歴テーブルの方が事故のあと追いができる。

### 4.2 `001_init.sql`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  issuer_name TEXT NOT NULL DEFAULT '',
  issuer_zip TEXT NOT NULL DEFAULT '',
  issuer_address TEXT NOT NULL DEFAULT '',
  issuer_tel TEXT NOT NULL DEFAULT '',
  issuer_email TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_branch TEXT NOT NULL DEFAULT '',
  bank_account_type TEXT NOT NULL DEFAULT '普通',
  bank_account_number TEXT NOT NULL DEFAULT '',
  bank_account_holder TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  default_due_days INTEGER NOT NULL DEFAULT 30,
  invoice_seq INTEGER NOT NULL DEFAULT 0,
  quote_seq INTEGER NOT NULL DEFAULT 0,
  seq_year INTEGER NOT NULL DEFAULT 0,
  last_backup_at TEXT,
  android_backup_dir TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO settings (id, updated_at) VALUES (1, datetime('now'));

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  honorific TEXT NOT NULL DEFAULT '御中',
  zip TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  unit_price_ex INTEGER NOT NULL,
  tax_rate INTEGER NOT NULL CHECK (tax_rate IN (8, 10)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'invoice')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued')),
  number TEXT,
  title TEXT NOT NULL DEFAULT '',
  issue_date TEXT,
  due_date TEXT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_honorific TEXT NOT NULL DEFAULT '御中',
  client_zip TEXT NOT NULL DEFAULT '',
  client_address TEXT NOT NULL DEFAULT '',
  issuer_name TEXT NOT NULL DEFAULT '',
  issuer_address TEXT NOT NULL DEFAULT '',
  issuer_tel TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  bank_snapshot TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  net_10 INTEGER NOT NULL DEFAULT 0,
  tax_10 INTEGER NOT NULL DEFAULT 0,
  net_8 INTEGER NOT NULL DEFAULT 0,
  tax_8 INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  source_quote_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '',
  unit_price_ex INTEGER NOT NULL,
  tax_rate INTEGER NOT NULL CHECK (tax_rate IN (8, 10)),
  amount_ex INTEGER NOT NULL
);

CREATE INDEX idx_documents_kind_status ON documents(kind, status, archived_at);
CREATE INDEX idx_document_lines_document ON document_lines(document_id, position);

CREATE TABLE backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ok INTEGER NOT NULL
);
```

合計カラム（`net_10` 等）は行更新のたびに `computeTotals` で書き戻す。一覧と PDF が再計算で揺れないため。再計算関数はテスト済みの1本だけを通す。

`backup_log` は「成功したバックアップの履歴」であり、復元の入力ではない。復元の入力はファイルそのもの。

### 4.3 以降のマイグレーション

v1.1 で列を足すときは `002_*.sql` を追加する。`001` は凍結。バックアップ `format` と `schema_version` を同時に上げ、旧バックアップは「同じメジャーの schema_version のみ復元可」。v1 では schema_version=1 以外を拒否する。

---

## 5. 主要アルゴリズム

### 5.1 税額と端数

**方式: 税率ごとの税抜合計に税率を掛け、円未満切捨て。**

国税庁は切捨て・切上げ・四捨五入をいずれも認める。切捨てで固定する。行ごと積上げにも、税込割戻しにもしない。設定項目にしない。

```ts
type Line = { quantity: number; unit_price_ex: number; tax_rate: 8 | 10 };

function lineAmountEx(q: number, unitPriceEx: number): number {
  return q * unitPriceEx;
}

function computeTotals(lines: Line[]) {
  let net10 = 0;
  let net8 = 0;
  for (const l of lines) {
    const amt = lineAmountEx(l.quantity, l.unit_price_ex);
    if (l.tax_rate === 10) net10 += amt;
    else net8 += amt;
  }
  const tax10 = Math.floor((net10 * 10) / 100);
  const tax8 = Math.floor((net8 * 8) / 100);
  return {
    net_10: net10,
    tax_10: tax10,
    net_8: net8,
    tax_8: tax8,
    total: net10 + tax10 + net8 + tax8,
  };
}
```

`Math.floor` は対象が非負整数の積なので、負のゼロ問題は起きない。単価が負の値はフォームで拒否する。

積上げとの差が出るケース（後述ゴールデン）:

- 行 55円 + 55円（10%）
- 行ごと切捨てなら消費税 5+5=10
- 本アプリは 110 に対して切捨て → **11**

UI の合計欄に「税率ごとの税抜合計に対して切捨て」と一文置く。ズレの問い合わせを設定画面ではなく計算の横で先に殺す。

適格請求書として PDF に必ず出す数字:

- 10%対象税抜、消費税10%、8%対象税抜、消費税8%、税込合計

0円の税率ブロックは行を出さない（空の「消費税8% 0」はノイズ）。

### 5.2 A4 1枚の保証

競合の失敗は「行が増えたら2枚目に落ちる」こと。実行時に WebView で測る方法は iOS/Android で高さがズレ、テストできない。やらない。

**決定論的高さモデル + 離散スケール + 収まらなければ発行禁止。**

定数（実装とテストで同じ数字を `lib/pdf/layout.ts` に置く）:

| 名前 | 値 |
|---|---|
| 用紙 | A4 210mm × 297mm |
| 余白 | 四辺 12mm |
| 内容領域 | 186mm × 273mm |
| 固定ヘッダ（タイトル・番号・日付） | 28mm |
| 固定当事者欄 | 32mm |
| 固定登録番号・振込先 | 18mm |
| 固定合計ブロック | 32mm |
| 固定フッタ | 8mm |
| 備考の基準高さ | 16mm（0文字なら 0） |
| 表ヘッダ + 行の基準高さ | 8mm / 行 |
| スケール段階 | 100, 95, 90, 85, 80, 75（%） |
| 行数ハード上限 | 30 |

```ts
const PAGE = 273;
const FIXED = 28 + 32 + 18 + 32 + 8; // 118
const SCALES = [100, 95, 90, 85, 80, 75] as const;

function noteHeightMm(noteChars: number, scale: number): number {
  if (noteChars === 0) return 0;
  const lines = Math.ceil(noteChars / (40 * (scale / 100)));
  return Math.max(16 * (scale / 100), lines * 5 * (scale / 100));
}

function pickScale(rowCount: number, noteChars: number) {
  for (const scale of SCALES) {
    const rowH = 8 * (scale / 100);
    const tableH = rowH * (1 + rowCount); // ヘッダ1 + データ
    const used = FIXED + tableH + noteHeightMm(noteChars, scale);
    if (used <= PAGE) return { scale, fits: true, usedMm: used };
  }
  return { scale: 75 as const, fits: false, usedMm: FIXED + 8 * 0.75 * (1 + rowCount) + noteHeightMm(noteChars, 75) };
}
```

HTML 側:

- `@page { size: A4; margin: 12mm; }`
- `printToFileAsync({ html, width: 595, height: 842 })`（72dpi の A4）。height を渡さないと2枚目が生まれる。
- `.page { width: 186mm; height: 273mm; overflow: hidden; }` は最後の安全網であり、主保証ではない。
- 表と備考の `font-size` / `line-height` に `scale` を掛ける。当事者欄と合計欄は読めるサイズを維持（スケール対象外）。明細だけ縮む。
- 日本語フォントは `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`。ウェブフォントは配布しない。

プレビューで `fits === false` のとき赤いバナーを出し、**発行ボタンを無効化**する。75%で無理やり出して切れる請求書は、2枚目に落ちる請求書より悪い。ユーザーは行を減らすか備考を短くする。上限30行はフォームでも拒否する。

ロゴと角印はレイアウト変数を爆発させるので v1 では持たない。

テンプレートは関数1つ `renderInvoiceHtml(doc, scale): string`。見積と請求の差はタイトル、支払期限の有無、登録番号の有無だけ。テンプレートファイルを2つに割らない。

### 5.3 バックアップ・復元・破損耐性

#### なぜ「Files に毎日出す」なのか

競合の主訴は (a) アプリ更新や端末移行で中身が空になる (b) iCloud バックアップから戻らない。対策は「ユーザーが Files / ストレージで名前を見て開けるファイル」を、アプリが毎日更新すること。アプリコンテナの中だけにある SQLite を「バックアップした」と呼ぶのは禁止。

#### ファイル形式（`.invbak`）

SQLite ファイルの生コピーはスキーマ変更と WAL の巻き込みで壊れやすい。**JSON スナップショット**にする。zip ライブラリを足さない。

```ts
type BackupFile = {
  magic: 'invoice-app-backup';
  format: 1;
  schema_version: 1;
  exported_at: string; // UTC ISO
  app_version: string;
  sha256: string; // payload の正規化 JSON の SHA-256（hex）
  payload: {
    settings: SettingsRow;
    clients: ClientRow[];
    items: ItemRow[];
    documents: DocumentRow[];
    document_lines: DocumentLineRow[];
  };
};
```

正規化は `serializePayload` 1本。キー順を固定し、空白なし `JSON.stringify`。書き込みと検証が同じ関数を使う。オブジェクトの列挙順に依存しない。

`sha256` は `payload` に対してだけ取る。ラッパを含めるとハッシュフィールド自身が循環する。

#### 日次自動

バックグラウンド実行に依存しない。

1. ルートレイアウトで `AppState` が `active` になったとき、`settings.last_backup_at` のローカル日付 ≠ 今日 ならバックアップする。
2. 書類の **発行成功直後** にも取る（請求書を出した日にバックアップが無い、を防ぐ）。

7日開かなければ新しいファイルは増えない。その代わり最後に成功したファイルが Files に残る。設定タブに「最終バックアップ: 2026-10-11 21:04」を常時出す。これがユーザーへの契約。

#### 保存場所

**iOS:** `UIFileSharingEnabled` と `LSSupportsOpeningDocumentsInPlace` を `app.json` で有効化。`Documents/backups/invoice-YYYY-MM-DD.invbak`。Files アプリの「この iPhone内」に見える。これが v1 の本丸。実機確認をリリースブロッカーにする。

**Android:** 初回バックアップ前に SAF でフォルダを選ばせる。URI を `settings.android_backup_dir` に保存し、以後そこに書く。未設定ならアプリ私有ディレクトリに書き、設定に「保存先未設定」を出す。私有だけに頼らない。

世代は **日付の異なる直近7ファイル**。同日は同じファイル名へ原子的に上書き。8日目以降は古い日付を消す。

#### 原子書き込み

1. 同一ディレクトリに `invoice-YYYY-MM-DD.invbak.tmp` を書く。
2. 読み戻し → magic / format / schema_version / sha256 を検証する。
3. 検証成功後に `invoice-YYYY-MM-DD.invbak` へ rename。
4. `settings.last_backup_at` と `backup_log`（`ok=1`）を更新する。
5. `.tmp` を消す。古い世代を prune する。

2の前に落ちたら `.tmp` が残る。次回起動で `.tmp` は無視して削除。3の前に落ちたら旧ファイルが残る。**検証前のバイト列で本番ファイルを上書きしない。**

#### 復元

1. 一覧の1件をタップ、または document picker で `.invbak` を選ぶ。
2. magic / format / `schema_version === 1` / sha256。一つでも失敗したらそこで止める。現行 DB に触らない。
3. payload の形を検証する（必須配列、`tax_rate ∈ {8,10}`、`settings.id === 1`、行の `document_id` が documents に存在する）。
4. 一時 DB `restore.db` を作り、`001_init` を適用し、ID を保持したまま INSERT。`sqlite_sequence` を各テーブルの MAX(id) に合わせる。
5. `PRAGMA foreign_key_check` と件数一致。
6. 開いている `app.db` を閉じる。
7. 現行 `app.db` を `app.db.pre-restore` にコピーする（既存があれば上書き）。
8. `restore.db` を `app.db` に置き換える。
9. 開き直し、`PRAGMA integrity_check`。失敗したら `app.db.pre-restore` を戻してエラーにする。

成功時も `app.db.pre-restore` は当面残す（次の復元まで）。「復元して壊れた」の逃げ道を1つ残す。複数世代の pre-restore は持たない。

#### 起動時の自己診断

起動直後に一度だけ `PRAGMA integrity_check`。`ok` 以外なら通常 UI を出さず、「バックアップから復元」だけを出す。自動では復元しない（古いファイルで新しい入力を消す方が悪い）。

WAL 中のバックアップは「トランザクションコミット後」に限定する。エクスポートは SQL から読むので、バックアップ中に WAL をファイルコピーしない。

改ざん検出はハッシュまで。署名鍵は持たない（鍵の保管が新しい単一障害点になる）。

---

## 6. 画面フロー

初回起動だけ自社情報を入れる。プレースホルダのまま発行させない。登録番号は空で先に進める（免税）。

```
初回
  └─ 自社情報（名称必須、住所、TEL、登録番号、振込先）
       └─ タブへ

タブ
  書類
    ├─ [+] → 書類編集（新規下書き。kind はセグメントで見積/請求）
    └─ 行タップ → 書類編集
         ├─ 宛先（登録済みから選ぶ / その場入力）
         ├─ 明細（品目から追加 / 手入力）
         ├─ 備考
         ├─ プレビュー（PDF）
         │    └─ 共有（expo-sharing）
         ├─ 発行（fits かつ宛先名称あり。番号確定・凍結・バックアップ）
         ├─ 見積を請求にする（issued quote のみ）
         ├─ 複製して下書き
         └─ アーカイブ（issued のみ）

  取引先
    └─ 一覧 / 編集

  品目
    └─ 一覧 / 編集（名称、単位、税抜単価、税率 8|10）

  設定
    ├─ 自社情報・登録番号・振込先・標準支払期限
    └─ バックアップ
         ├─ 最終成功時刻
         ├─ 今すぐバックアップ
         ├─ 世代一覧（日付と検証 OK）
         ├─ ファイルを選んで復元
         └─ Android: 保存フォルダ
```

v1 のルート上限:

```
app/
  _layout.tsx
  index.tsx              # 設定済みなら /(tabs)/documents、未設定なら /setup
  setup.tsx
  (tabs)/_layout.tsx
  (tabs)/documents.tsx
  (tabs)/clients.tsx
  (tabs)/items.tsx
  (tabs)/settings.tsx
  document/[id].tsx
  document/[id]/preview.tsx
  client/[id].tsx
  item/[id].tsx
  settings/backup.tsx
```

これ以上の画面を足すときは、既存のどれを消すか先に決める。ダッシュボード、検索専用画面、統計、オンボーディングカルーセルは作らない。書類一覧のフィルタは「見積 / 請求 / アーカイブ」のセグメント1つ。全文検索は行数が数百になってから `LIKE` で足す。

発行済み編集画面は読み取り専用。直したいときは「複製して下書き」。発行済みの数字を黙って変える機能は、バックアップの意味を壊すので持たない。

---

## 7. モジュール構造

レイヤーアーキテクチャ、feature-sliced、usecase ディレクトリは作らない。置く場所は次だけ。

```
app/                     # 画面。SQL を直接書かない
components/
  Button.tsx
  Field.tsx
  LineEditor.tsx
  Confirm.tsx
lib/
  db/
    open.ts              # シングルトン接続、起動時 migrate + integrity_check
    migrate.ts
    migrations/001_init.sql
    repos/settings.ts
    repos/clients.ts
    repos/items.ts
    repos/documents.ts   # 行更新と computeTotals の書き戻しを同一トランザクションに
  tax.ts
  money.ts
  date.ts
  pdf/
    layout.ts            # pickScale と定数
    template.ts          # renderInvoiceHtml
    print.ts
  backup/
    serialize.ts
    checksum.ts
    export.ts
    restore.ts
    schedule.ts
tests/
  golden/tax/
  golden/layout/
  backup.test.ts
  migrate.test.ts
```

依存方向は一方通行: `app` → `lib/repos` → `lib/tax|pdf|backup`。`lib` は React を import しない（`schedule.ts` の AppState 購読だけ例外で、`app/_layout.tsx` から呼ぶ関数に閉じる）。

書類保存の擬似コード（実装時にこれを崩さない）:

```ts
db.withTransactionSync(() => {
  upsertDocument(doc);
  replaceLines(doc.id, lines);
  const t = computeTotals(lines);
  updateDocumentTotals(doc.id, t);
});
```

---

## 8. テスト戦略

実機 E2E（Detox 等）は v1 で持たない。税と「1枚判定」とバックアップ検証は Node 上の Jest で機械的に固定する。PDF のピクセルはプラットフォーム差が大きく、ゴールデンがすぐ腐る。

### 8.1 税（`tests/golden/tax/*.json`）

入力は行配列。期待値は `net_10 / tax_10 / net_8 / tax_8 / total`。ケースをコードに直書きせず JSON を増やす。

必須ケース:

| ID | 内容 | 期待の要点 |
|---|---|---|
| T01 | 数量1・税抜1000・10% | tax_10=100, total=1100 |
| T02 | 税抜101・10% | tax_10=10（10.1 の切捨て） |
| T03 | 税抜99・10% | tax_10=9 |
| T04 | 55 + 55（10%） | tax_10=**11**（積上げなら10。方式の固定） |
| T05 | 10% と 8% 混在 | 税率ブロックが独立に切捨て |
| T06 | 行0件 | 全部0 |
| T07 | 税抜 1_234_567・10% | 大きな整数でも float を経由しない |
| T08 | 数量3・単価333・8% | amount_ex=999, tax_8=79 |
| T09 | 8% のみ | net_10=tax_10=0、8%側だけ出る |

### 8.2 レイアウト（`tests/golden/layout/*.json`）

入力は `{ rowCount, noteChars }`。期待は `{ scale, fits }`。`layout.ts` の定数を変えたらゴールデンを更新し、PR で「なぜA4モデルを変えたか」を書く。

必須ケース:

| ID | 入力 | 期待 |
|---|---|---|
| L01 | 8行・備考0 | scale=100, fits |
| L02 | 16行・備考0 | scale=100, fits（境界） |
| L03 | 17行・備考0 | 100では不足、次の段階で fits |
| L04 | 8行・備考400字 | 備考がスケールを落とす |
| L05 | 30行・備考500字 | fits=false, scale=75 |
| L06 | 0行・備考0 | scale=100, fits |

加えて `renderInvoiceHtml` の文字列テスト（スナップショットではなく含むこと検証）:

- 登録番号があるとき `T` + 13桁が HTML に含まれる
- 8%行があるとき「軽減税率」の注記がある
- `fits` の書類ではインライン style の scale が `pickScale` と一致する

### 8.3 バックアップ

- 往復: メモリ上の payload → serialize → checksum → parse → 一致
- 1バイト改ざん → sha256 不一致で拒否
- 末尾切断 → パース失敗で拒否
- magic 違い → 拒否
- schema_version=2 → 拒否
- 復元トランザクション失敗時、現行 DB が残ること（ファイル操作はテストダブル）
- `integrity_check` 失敗時に `pre-restore` へ戻すこと

### 8.4 マイグレーション

空 DB に 001 を当て、`settings` が1行、外部キーが ON、WAL であること。

---

## 9. リスク

| リスク | なぜ起きるか | v1 での扱い |
|---|---|---|
| `expo-print` が height 指定でも改ページする | OS の印刷レンダラ依存 | width/height 固定、`.page` 高さ固定、`fits` でないと発行しない。**実機で16行と30行を見て確認するのがリリース条件。** |
| iOS Files に Documents が見えない | Info.plist フラグ漏れ | `app.json` の2フラグをチェックリスト化する。シミュレータではなく実機。 |
| Android SAF の URI が権限切れ | ユーザーがフォルダを移す | 書き込み失敗を設定に出し、フォルダ再選択。私有ディレクトリの7世代は残っている。 |
| アプリを長期間開かない | 日次がフォアグラウンド依存 | 最終バックアップ日付を設定の最上段に出す。発行時バックアップで「使っている日」は守る。 |
| ストレージ満杯 | 書けない・WAL が伸びる | バックアップ失敗を無視しない。発行後バックアップが失敗したら発行自体は成功させ、バナーで「今すぐ Files に共有」を出す。発行ロールバックはしない（番号が飛ぶ方がまし）。 |
| 税ソフトと1円ズレる | 積上げ対一括 | T04 を公開仕様にする。画面に計算規則を書く。 |
| 日本語フォント欠落（Android） | 端末フォント差 | システムスタックのみ。欠けたら Noto 系が拾う前提を実機で見る。ウェブフォントは容量とライセンスを増やすので後回し。 |
| アプリ削除 | 私有データ消滅 | Files に出ている7ファイルが残っていれば復元可。オンボーディングで「Files に毎日出します」を一文で言う。カルーセルにはしない。 |
| ソロの仕様忘れ | 実装時に例外経路が増える | 本ファイルが仕様。計算とバックアップの分岐を足したくなったら、先に本ファイルの原則1を破るか書く。 |

---

## 10. 却下した代替案

| 案 | 却下理由 |
|---|---|
| サーバー / Firebase / 独自同期 | 売りが「端末の外に出さない」。障害面と個情報も増える。 |
| iCloud / CloudKit を本バックアップにする | 競合の失敗そのもの。補助の「ユーザーが自分で iCloud Drive に置く」は共有シートで足りる。 |
| SQLite ファイルの生コピー | WAL・schema 変更・部分コピーで壊れやすい。JSON + ハッシュの方が検証が単純。 |
| Drizzle 等の ORM | テーブル5つに対して勝ちがない。SQL が見える方がバックアップ実装とテストが短い。 |
| UUID PK | 読めない。衝突回避は単一端末では不要。 |
| 税込入力を正とする | 税率変更と混在行で割戻しが要る。税抜が先。 |
| 丸め3モード / 積上げ切替 | ユーザーが間違ったモードを選ぶ。問い合わせの再現も増える。 |
| 非課税・不課税・輸出 | 対象外ユーザー向け。列とテンプレート分岐を増やす。 |
| 小数数量 | 金額経路に小数が入り、整数円の原則が崩れる。 |
| 外貨・複数テンプレ・ロゴ・角印 | A4 モデルが崩壊する。 |
| 定期請求・入金管理 | 別アプリ。 |
| 有料機能を IAP で解錠 | 実装とサポートが本体より重い。 |
| 暗号化バックアップ / SQLCipher | 鍵を忘れると売り（復元できる）を自分で殺す。§11。 |
| 電子帳簿保存法（検索要件・タイムスタンプ） | 請求書発行と法定帳簿は別問題。謳わない。 |
| バックグラウンド必須の日次 | OS が止める。フォアグラウンド + 発行時の方が実際に残る。 |
| ダークモード専用トークン設計 | システムに任せて放置。工数を税とバックアップに使う。 |
| Detox フル E2E | メンテが本体を超える。ゴールデン3系統で先に固める。 |

---

## 11. 他の観点への反論・懸念

この設計は「出荷できる小ささ」を最上位に置いている。データ保護、税・法務の厳密さ、UX の厚みを最上位に置いた設計とは、次の点で意図的に衝突する。衝突は妥協ではなく、v1 の選択である。ただし無視してよいリスクではないので、懸念も同じ節に書く。

### 11.1 データ保護最適化への反論

保護側は次を欲しがる: SQLCipher、生体認証ロック、バックアップの暗号化、リモートワイプ、Files に平文を置かない、スクリーンショット抑制。

**反論。** この市場の実害は端末盗難より「更新したら空になった」「iCloud から戻らなかった」である。暗号化とロックは、その実害と同じ形（開けない＝消えた）を自分で作る。鍵管理をソロが間違えると、復元保証は紙になる。Files に平文 JSON が見えることは漏洩面では弱点だが、**見えること自体が復元保証の実装**である。ユーザーは「invoice-2026-10-11.invbak を Drive に置いた」と自分の言葉で言える。コンテナ内の暗号化 DB にはそれができない。

脅威モデルを「紛失した iPhone の中を第三者が見る」に置くなら、OS のデバイス暗号化とパスコードに乗る。アプリが二枚目の鍵を持つ必要はない。

**懸念。** 取引先名・振込先・金額が Files 経由で家族共有 iPad や PC に並ぶ。設定に「バックアップは平文です。共有フォルダに置かないでください」と書く。v2 で任意 PIN を足す余地はあるが、PIN 忘れを復元不能にしてはならない（バックアップファイル単体で戻せることを維持する）。

### 11.2 税・法務最適化への反論

法務側は次を欲しがる: 積上げと割戻しの切替、行ごと/帳票ごとの丸め、非課税区分、適格返還請求書、登録番号チェックデジット、税理士監修、電子帳簿保存法、7年保存の改ざん防止、免責を避けるための機能追加。

**反論。** 分岐する計算はテストが組み合わせ爆発し、ユーザーが「正しい方」を選べない。国税庁は税率区分ごとの一括と切捨てを認めており、フリーランスの実務はその1本で足りる。電子帳簿保存法は「帳簿を電子で保存する義務」の話であり、PDF を共有するアプリが名乗ると、検索要件とタイムスタンプまで背負う。名乗らない。登録番号の実在確認はサーバーが要る。税理士監修を v1 のゲートにすると、ソロは永遠に出ない。

計算は公開し、画面に書き、ゴールデンをリポジトリに置く。これが監修の代替ではなく、**再現可能な契約**である。ストア説明に「税務助言ではない。最終確認は利用者の責任」と書く。

**懸念。** T04（55+55）で会計ソフトと1円違う問い合わせは必ず来る。無視せず、計算規則を合計の直下に出す。制度改正（税率追加）が来たら、知る税率を増やす変更は `tax.ts` と CHECK 制約とテンプレートの3点に閉じる。それ以外に税率 enum を散らさない。適格請求書の記載事項のうち v1 が満たすのは §3.6 と §5.2 の固定欄だけであり、「完全対応」とは言わない。

### 11.3 UX 最適化への反論

UX 側は次を欲しがる: オンボーディングカルーセル、空状態のイラスト、テンプレート複数、ロゴと印影、ダッシュボード、検索とタグ、アニメーション、ハプティクス、ダークテーマの作り込み、クライアント用ポータル。

**反論。** 売りの体験は「出した PDF が1枚」と「昨日のファイルから戻る」の2つだけである。画面を増やすほど、発行とバックアップのテストが薄くなる。ロゴと印影は高さモデルを壊す。検索専用画面は、書類が数十枚の顧客（初期ユーザー）には一覧で足りる。1,280円の見た目が簡素なのはリスクだが、コンポーネント4つをタイポグラフィだけ整える方が、中途半端なデザインシステムより壊れない。

初回の自社情報は味気ないが、それが請求書のヘッダそのものなので省略しない。「株式会社サンプル」で先に進ませると、そのまま送られる。

**懸念。** 安すぎず高すぎない有料アプリは、アイコンと PDF の第一印象で判断される。テンプレートは1つでも、余白と字揃えを固定し、プレビューを発行前に必ず通す。空の書類一覧は「請求書を作る」一次アクション1つだけにする。空状態を増やして導線を分散させない。

---

## 12. v1 の範囲外（再掲）

次を issue に積んでも v1 ブランチでは実装しない。

- クラウド、複数端末同期、チーム
- IAP、サブスク、無料枠
- ロゴ、角印、複数テンプレ、英語
- 非課税、小数数量、外貨、定期請求、入金
- 暗号化、生体ロック、電子帳簿保存法
- E2E、クラッシュレポート、分析

実装が始まったあとで「ついで」にどれかを足したくなったら、先に本ファイルの原則1（やり方は1つ）と出荷判定3点を更新する。更新できないなら、それは v1 の仕事ではない。
