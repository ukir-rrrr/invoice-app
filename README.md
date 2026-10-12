# invoice-app

オフラインの請求・見積アプリ（Expo / TypeScript / expo-router）。

## 開発

```bash
npm install
npm run web          # Web（expo-sqlite 用に COOP/COEP 付きプロキシ）
npm run verify       # typecheck + lint + format + 税・マイグレーションの Jest
npm run playwright   # ホーム画面の E2E スクリーンショット
```

設計の正本: `DESIGN.md`、UI: `UI_DESIGN.md`（パレット A）。
