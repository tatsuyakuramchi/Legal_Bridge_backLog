# Backlog 項目の再配置方針

## 結論

- `payment_notice` は現状のまま Backlog 運用でよい
- `revenue_share_report` は最小限のまま Backlog 運用でよい
- `license_ledger` は Backlog 直載せを続けると重い。金銭条件を中心に別テーブル化する前提で整理した方がよい

## 優先度

1. `payment_notice`
2. `revenue_share_report`
3. `license_ledger`

## payment_notice

### Backlog に残す

- `bank_info`
- `payment_due_date`
- `amount`
- `date`
- `name`
- `qty`
- `unit_price`
- `revshare_basis`
- `revshare_note`

### Backlog に残さない

- `SENDER_NAME`
- `SENDER_ZIP`
- `SENDER_ADDRESS`
- `SENDER_DEPT`
- `notice_date`
- `notice_id`
- `vendor_name`
- `vendor_invoice_num`
- `vendor_type`
- `totalWithTax`
- `paymentAmount`
- `expenseAmount`
- `showWithholdingNote`
- `withholdingRateLabel`

### 理由

- 送信者情報は `fixed:company` と `user.department` で補完済み
- 相手方情報は `partner` DB で補完済み
- 金額集計は `calc` に寄せられている
- Backlog には案件単位の支払入力だけ残せばよい

## revenue_share_report

### Backlog に残す

- `minimum_guarantee`
- `payment_date`
- `payment_method`
- `special_note`
- `amount`
- `baseamount`
- `calculation`
- `detail`
- `name`
- `note`
- `period`
- `rate`

### Backlog に残さない

- `CONTRACTOR_NAME`
- `CONTRACTOR_INVOICE_NUM`
- `ISSUE_DATE`
- `NOTICE_ID`
- `ORDER_NO`
- `TOTAL_NONTAX`

### 理由

- 受託者情報は `partner` DB で補完できる
- 発行日・通知書番号・発注書番号は `auto`
- 非課税合計は `calc`
- したがって Backlog には計算材料だけ残せば足りる

## license_ledger

### Backlog に残してよい最小セット

- `基本契約名`
- `ライセンス種別名`
- `許諾開始日`
- `許諾期間注記`
- `原著作物名`
- `原著作物補記`
- `対象製品予定名`
- `素材名`
- `素材番号`
- `素材権利者`
- `監修者`
- `特記事項`

### 別テーブル化を推奨

- `金銭条件1_地域言語ラベル`
- `金銭条件1_基準価格ラベル`
- `金銭条件1_計算方式`
- `金銭条件1_料率`
- `金銭条件1_計算期間`
- `金銭条件1_MG_AG`
- `金銭条件1_支払条件`
- `金銭条件1_計算式`
- `金銭条件1_補足条件`
- `金銭条件1_通貨`
- `金銭条件2_見出し`
- `金銭条件2_地域`
- `金銭条件2_言語`
- `金銭条件2_計算方式`
- `金銭条件2_分配率`
- `金銭条件2_MG_AG`
- `金銭条件2_支払条件`
- `金銭条件2_計算式`
- `金銭条件2_計算式注記`
- `金銭条件2_補足条件`
- `金銭条件2_概要`
- `金銭条件2_通貨`
- `金銭条件3_見出し`
- `金銭条件3_地域`
- `金銭条件3_言語`
- `金銭条件3_計算方式`
- `金銭条件3_料率`
- `金銭条件3_MG_AG`
- `金銭条件3_支払条件`
- `金銭条件3_計算式`
- `金銭条件3_計算式注記`
- `金銭条件3_補足条件`
- `金銭条件3_概要`
- `金銭条件3_通貨`

### Backlog に残さない

- `台帳ID`
- `契約書番号`
- `発行日`
- `LICENSEE_IS_CORPORATION`
- `LICENSOR_IS_CORPORATION`
- `licensor名`
- `licensor_住所`
- `licensor_氏名会社名`
- `licensor_代表者名`
- `licensee名`
- `licensee_住所`
- `licensee_氏名会社名`
- `licensee_代表者名`

### 理由

- 契約ヘッダは Backlog に置けるが、金銭条件 1〜3 は繰り返し構造で、Backlog カスタム属性の消費が重い
- ライセンサー情報は `partner` DB、ライセンシー情報は `fixed:company`、採番は `auto` で解決できる
- 将来的には `license_ledger_terms` のような別テーブルを作り、1 レコードに複数条件をぶら下げる方が自然

## 推奨データ構造

### license_ledger_header

- `contract_no`
- `partner_id`
- `basic_contract_name`
- `license_type`
- `license_start_date`
- `license_note`
- `original_work_name`
- `original_work_note`
- `planned_product_name`
- `material_name`
- `material_no`
- `material_rights_holder`
- `supervisor`
- `special_note`

### license_ledger_terms

- `ledger_id`
- `term_order`
- `heading`
- `region`
- `language`
- `region_language_label`
- `price_label`
- `calc_method`
- `rate`
- `share_rate`
- `period`
- `mg_ag`
- `payment_terms`
- `formula`
- `formula_note`
- `summary`
- `note`
- `currency`

## 次の実装候補

1. `license_ledger` の金銭条件 1〜3 を DB テーブル化
2. テンプレート定義の `backlog.金銭条件*` を `manual` か DB 参照へ置換
3. 管理画面に `license_ledger_terms` 編集 UI を追加
