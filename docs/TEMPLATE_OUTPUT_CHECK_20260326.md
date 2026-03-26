# テンプレート出力確認 2026-03-26

## 実施内容

- 実行コマンド: `npx tsx scripts/generate-sample-docs.ts`
- 出力先: `sample/`
- 実施日時: 2026-03-26

## 結果

- 全 14 テンプレートでサンプル HTML / PDF の生成が完了
- 例外終了なし
- 重点確認対象だった以下 3 テンプレートも生成完了
  - `template_payment_notice`
  - `template_revenue_share_report`
  - `template_ledger_v5__1_`

## 生成結果ファイル

- 一覧JSON: `sample/sample-results.json`
- 支払通知書: `sample/SAMPLE-TEMPLATE_PAYMENT_NOTICE-template_payment_notice-1774503754829.html`
- レベニューシェア報告書: `sample/SAMPLE-TEMPLATE_REVENUE_SHARE_REPORT-template_revenue_share_report-1774503749351-template_revenue_share_report.html`
- ライセンス台帳: `sample/SAMPLE-TEMPLATE_LEDGER_V5__1_-template_ledger_v5__1_-1774503703513-template_ledger_v5__1_.html`

## 補足

- 一部テンプレートは合冊テンプレートを同時生成するため、1 テンプレートから複数 HTML / PDF が出力される
- 今回の確認は「生成処理が落ちずに最後まで通ること」の確認が主目的
- 文面や見た目の最終レビューは、生成済み HTML / PDF を個別に確認する前提
