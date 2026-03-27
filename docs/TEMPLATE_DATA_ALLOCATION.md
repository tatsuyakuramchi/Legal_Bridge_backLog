# Template Data Allocation

## 方針

- `Backlog` には案件ごとに変わる入力値のみを置く
- `ローカルDB` には固定マスタ情報と再利用データを置く
- `アプリ側` では採番、整形、集計、固定値補完を行う

## service_basic

### Backlog

- `contract_date`
- `remarks`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_phone`
- `partners.contact_email`
- `partners.invoice_registration_number`
- `partners.bank_name`
- `partners.bank_branch`
- `partners.bank_account_type`
- `partners.bank_account_number`
- `partners.bank_account_holder`

### アプリ側

- 契約番号
- 契約日整形
- 自社情報固定値

## license_basic

### Backlog

- `credit_name`
- `jurisdiction`
- `original_author`
- `original_work`
- `承継覚書日付`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.bank_name`
- `partners.bank_branch`
- `partners.bank_account_type`
- `partners.bank_account_number`
- `partners.bank_account_holder`

### アプリ側

- 契約番号
- 自社情報固定値

### 補足

- `has_remarks` は Backlog から外す方針

## nda

### Backlog

- `contract_date`
- `contract_period`
- `confidentiality_period`
- `jurisdiction`
- `nda_purpose`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`

### アプリ側

- `CONTRACT_DATE_FORMATTED`
- 自社情報固定値

## order

### Backlog

- `order_date`
- `contract_period`
- `work_start_date`
- `delivery_date`
- `payment_terms`
- `project_title`
- `item_name`
- `amount`
- `category`
- `pay_method`
- `bank_info`
- `remarks`
- `special_terms`
- `accept_by_performance`
- `accept_required`
- `accept_method`
- `accept_reply_due_date`
- `show_sign_section`
- `show_order_sign_section`
- `transfer_fee_payer`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `master_contract_ref`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_person`
- `partners.contact_email`
- `partners.contact_phone`
- `users.name`
- `users.department`
- `users.google_email`
- `users.phone`

### アプリ側

- 発注番号
- `order_date` の年/月/日分解
- 自社情報固定値

### 補足

- `remarks_free`
- `detail_text`
- `vendor_suffix`
  は Backlog から外す方針

## order_planning

### Backlog

- `order_date`
- `first_draft_deadline`
- `final_deadline`
- `payment_terms`
- `project_title`
- `item_name`
- `amount`
- `category`
- `pay_method`
- `bank_info`
- `remarks`
- `special_terms`
- `accept_by_performance`
- `accept_required`
- `accept_method`
- `accept_reply_due_date`
- `show_sign_section`
- `transfer_fee_payer`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `master_contract_ref`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_person`
- `partners.contact_email`
- `partners.contact_phone`
- `users.name`
- `users.department`
- `users.google_email`
- `users.phone`

### アプリ側

- 発注番号
- `order_date` の年/月/日分解
- 自社情報固定値

## inspection_report

### Backlog

- `approval_date`
- `approval_comments`
- `business_description`
- `delivery_type`
- `delivery_url`
- `milestone_name`
- `partial_number`
- `is_final_delivery`
- `iscompleted`
- `hasrevision`
- `revisiondetail`
- `hasamountchange`
- `originalamount`
- `newamount`
- `amountchangereason`
- `name`
- `no`
- `notes`
- `spec`
- `thistimequantity`
- `totalquantity`
- `unitprice`
- `project_name`
- `approver_name`
- `approver_department`
- `reviewer_name`
- `reviewer_department`
- `person_name`
- `person_department`
- `completiondate`

### ローカルDB

- `contracts.partner_id`
- `partners.name`
- `partners.address`
- `partners.representative`

### アプリ側

- 納品ID
- 合計計算
- 表示整形

## royalty_report

### Backlog

- `issue_date`
- `date`
- `name`
- `detail`
- `period_text`
- `qty`
- `rate`
- `amount`
- `deduction`
- `deduction_note`

### ローカルDB

- `partners.name`
- `partners.invoice_registration_number`

### アプリ側

- 発行日補完
- 合計計算
- 支払通知との束ね処理

## revenue_share_report

### Backlog

- `payment_date`
- `payment_method`
- `minimum_guarantee`
- `special_note`
- `period`
- `name`
- `detail`
- `calculation`
- `baseamount`
- `rate`
- `amount`
- `note`
- `deduction`
- `deduction_note`

### ローカルDB

- `partners.name`
- `partners.invoice_registration_number`

### アプリ側

- 通知番号
- 発行日
- 非課税合計
- 合計計算

## payment_notice

### Backlog

- `payment_due_date`
- `bank_info`
- `date`
- `name`
- `qty`
- `unit_price`
- `amount`
- `revshare_basis`
- `revshare_note`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.invoice_registration_number`
- `partners.bank_name`
- `partners.bank_branch`
- `partners.bank_account_type`
- `partners.bank_account_number`
- `partners.bank_account_holder`
- `users.name`
- `users.department`
- `users.google_email`
- `users.phone`

### アプリ側

- 通知番号
- 発行日
- 合計
- 税計算
- 送信者固定表示

## license_ledger

### Backlog

- なし、または最小限のヘッダのみ

### ローカルDB

- `license_ledger_terms.term_order`
- `license_ledger_terms.heading`
- `license_ledger_terms.region`
- `license_ledger_terms.language`
- `license_ledger_terms.region_language_label`
- `license_ledger_terms.base_price_label`
- `license_ledger_terms.calc_method`
- `license_ledger_terms.rate`
- `license_ledger_terms.share_rate`
- `license_ledger_terms.calc_period`
- `license_ledger_terms.mg_ag`
- `license_ledger_terms.payment_terms`
- `license_ledger_terms.formula`
- `license_ledger_terms.formula_note`
- `license_ledger_terms.summary`
- `license_ledger_terms.note`
- `license_ledger_terms.currency`
- `contracts.contract_no`
- `contracts.contract_type`
- `contracts.start_date`
- `contracts.end_date`
- `contracts.partner_id`
- `contracts.counterparty`
- `contracts.counterparty_person`
- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.invoice_registration_number`

### アプリ側

- 台帳ID
- 契約番号
- 発行日
- 自社固定情報

### 補足

- 現在の整理では Backlog 主体ではなく DB 主体

## sales_buyer

### Backlog

- `contract_date`
- `confidentiality_years`
- `cure_period_days`
- `delivery_location`
- `inspection_period_days`
- `jurisdiction`
- `payment_condition_summary`
- `product_scope`
- `special_terms`
- `warranty_period`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_email`
- `partners.contact_phone`

### アプリ側

- 契約番号
- 自社固定情報

## sales_seller_standard

### Backlog

- `contract_date`
- `confidentiality_years`
- `cod_delivery_days`
- `delivery_days_after_payment`
- `delivery_location`
- `inspection_period_days`
- `jurisdiction`
- `monthly_closing_day`
- `monthly_payment_due_day`
- `payment_method`
- `prepay_deadline_days`
- `product_scope`
- `special_terms`
- `warranty_period`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_email`
- `partners.contact_phone`

### アプリ側

- 契約番号
- 自社固定情報

## sales_seller_credit

### Backlog

- `contract_date`
- `confidentiality_years`
- `delivery_fee_threshold`
- `delivery_location`
- `deposit_replenish_days`
- `inspection_period_days`
- `jurisdiction`
- `monthly_closing_day`
- `payment_condition_summary`
- `payment_due_day`
- `product_scope`
- `security_deposit_amount`
- `special_terms`
- `warranty_period`

### ローカルDB

- `partners.name`
- `partners.address`
- `partners.representative`
- `partners.contact_email`
- `partners.contact_phone`

### アプリ側

- 契約番号
- 自社固定情報
