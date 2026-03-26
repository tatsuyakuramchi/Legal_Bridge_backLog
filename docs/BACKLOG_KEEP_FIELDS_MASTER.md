# Backlog に残すべき項目一覧

## 方針

- Backlog に残すのは「案件ごとに変わる入力値」のみ
- `partner.*` は取引先 DB
- `user.*` はユーザー DB
- `fixed:company` は固定値
- `auto` / `calc` はアプリ側自動生成
- `manual` は Backlog に残さない。必要なら将来ローカル UI または別テーブルへ移す

## テンプレート別一覧

### service_basic

- `contract_date_year`
- `contract_date_month`
- `contract_date_day`
- `remarks`
- `vendor_phone`

### license_basic

- `credit_name`
- `has_remarks`
- `jurisdiction`
- `original_author`
- `original_work`
- `承継覚書日付`

### license_ledger

- `ライセンス種別名`
- `監修者`
- `基本契約名`
- `許諾開始日`
- `許諾期間注記`
- `金銭条件1_MG_AG`
- `金銭条件1_基準価格ラベル`
- `金銭条件1_計算期間`
- `金銭条件1_計算式`
- `金銭条件1_計算方式`
- `金銭条件1_支払条件`
- `金銭条件1_地域言語ラベル`
- `金銭条件1_通貨`
- `金銭条件1_補足条件`
- `金銭条件1_料率`
- `金銭条件2_MG_AG`
- `金銭条件2_概要`
- `金銭条件2_計算式`
- `金銭条件2_計算式注記`
- `金銭条件2_計算方式`
- `金銭条件2_見出し`
- `金銭条件2_言語`
- `金銭条件2_支払条件`
- `金銭条件2_地域`
- `金銭条件2_通貨`
- `金銭条件2_分配率`
- `金銭条件2_補足条件`
- `金銭条件3_MG_AG`
- `金銭条件3_概要`
- `金銭条件3_計算式`
- `金銭条件3_計算式注記`
- `金銭条件3_計算方式`
- `金銭条件3_見出し`
- `金銭条件3_言語`
- `金銭条件3_支払条件`
- `金銭条件3_地域`
- `金銭条件3_通貨`
- `金銭条件3_補足条件`
- `金銭条件3_料率`
- `原著作物補記`
- `原著作物名`
- `素材権利者`
- `素材番号`
- `素材名`
- `対象製品予定名`
- `特記事項`

### nda

- `confidentiality_period`
- `contract_date_formatted`
- `contract_period`
- `jurisdiction`
- `nda_purpose`

### order

- `accept_by_performance`
- `accept_method`
- `accept_reply_due_date`
- `accept_required`
- `amount`
- `bank_info`
- `category`
- `contract_period`
- `delivery_date`
- `detail_text`
- `item_name`
- `master_contract_ref`
- `order_date_day`
- `order_date_month`
- `order_date_year`
- `pay_method`
- `payment_terms`
- `project_title`
- `remarks`
- `remarks_free`
- `show_order_sign_section`
- `show_sign_section`
- `special_terms`
- `transfer_fee_payer`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `vendor_suffix`
- `work_start_date`

### order_planning

- `accept_by_performance`
- `accept_method`
- `accept_reply_due_date`
- `accept_required`
- `amount`
- `bank_info`
- `category`
- `final_deadline`
- `first_draft_deadline`
- `item_name`
- `master_contract_ref`
- `order_date_day`
- `order_date_month`
- `order_date_year`
- `pay_method`
- `payment_terms`
- `project_title`
- `remarks`
- `show_sign_section`
- `special_terms`
- `transfer_fee_payer`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `vendor_suffix`

### inspection_report

- `amountchangereason`
- `approval_comments`
- `approval_date`
- `approver_department`
- `approver_name`
- `business_description`
- `completiondate`
- `delivery_type`
- `delivery_url`
- `hasamountchange`
- `hasrevision`
- `is_final_delivery`
- `iscompleted`
- `milestone_name`
- `name`
- `newamount`
- `no`
- `notes`
- `originalamount`
- `partial_number`
- `person_department`
- `person_name`
- `project_name`
- `reviewer_department`
- `reviewer_name`
- `revisiondetail`
- `spec`
- `thistimequantity`
- `totalquantity`
- `unitprice`

### royalty_report

- `amount`
- `date`
- `detail`
- `issue_date`
- `name`
- `qty`
- `rate`

### revenue_share_report

- `amount`
- `baseamount`
- `calculation`
- `detail`
- `minimum_guarantee`
- `name`
- `note`
- `payment_date`
- `payment_method`
- `period`
- `rate`
- `special_note`

### payment_notice

- `amount`
- `bank_info`
- `date`
- `name`
- `payment_due_date`
- `qty`
- `revshare_basis`
- `revshare_note`
- `unit_price`

### sales_buyer

- `confidentiality_years`
- `contract_date`
- `cure_period_days`
- `delivery_location`
- `inspection_period_days`
- `jurisdiction`
- `payment_condition_summary`
- `product_scope`
- `special_terms`
- `warranty_period`

### sales_seller_standard

- `cod_delivery_days`
- `confidentiality_years`
- `contract_date`
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

### sales_seller_credit

- `confidentiality_years`
- `contract_date`
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

## 運用上の注意

- `license_ledger` は Backlog 項目数を大きく消費するため、将来的には別テーブル化の優先度が高い
- `order` と `order_planning` は明細系の `manual` 項目が多い。これらは Backlog ではなく別 UI か別データ構造で持つ方がよい
- `payment_notice` と `revenue_share_report` は今回の修正で一部が `auto` / `calc` / `user` / `fixed:company` に寄ったため、Backlog 残置項目は以前より減っている

## 全体で Backlog に残す候補の重複排除後一覧

- `accept_by_performance`
- `accept_method`
- `accept_reply_due_date`
- `accept_required`
- `amount`
- `amountchangereason`
- `approval_comments`
- `approval_date`
- `approver_department`
- `approver_name`
- `bank_info`
- `baseamount`
- `business_description`
- `calculation`
- `category`
- `cod_delivery_days`
- `completiondate`
- `confidentiality_period`
- `confidentiality_years`
- `contract_date`
- `contract_date_day`
- `contract_date_formatted`
- `contract_date_month`
- `contract_date_year`
- `contract_period`
- `credit_name`
- `cure_period_days`
- `date`
- `delivery_date`
- `delivery_days_after_payment`
- `delivery_fee_threshold`
- `delivery_location`
- `delivery_type`
- `delivery_url`
- `deposit_replenish_days`
- `detail`
- `detail_text`
- `final_deadline`
- `first_draft_deadline`
- `has_remarks`
- `hasamountchange`
- `hasrevision`
- `inspection_period_days`
- `is_final_delivery`
- `iscompleted`
- `issue_date`
- `item_name`
- `jurisdiction`
- `master_contract_ref`
- `milestone_name`
- `minimum_guarantee`
- `monthly_closing_day`
- `monthly_payment_due_day`
- `name`
- `nda_purpose`
- `newamount`
- `no`
- `note`
- `notes`
- `order_date_day`
- `order_date_month`
- `order_date_year`
- `original_author`
- `original_work`
- `originalamount`
- `partial_number`
- `pay_method`
- `payment_condition_summary`
- `payment_date`
- `payment_due_date`
- `payment_method`
- `payment_terms`
- `period`
- `person_department`
- `person_name`
- `prepay_deadline_days`
- `product_scope`
- `project_name`
- `project_title`
- `qty`
- `rate`
- `remarks`
- `remarks_free`
- `reviewer_department`
- `reviewer_name`
- `revshare_basis`
- `revshare_note`
- `revisiondetail`
- `security_deposit_amount`
- `show_order_sign_section`
- `show_sign_section`
- `special_note`
- `special_terms`
- `spec`
- `thistimequantity`
- `totalquantity`
- `transfer_fee_payer`
- `unit_price`
- `unitprice`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `vendor_phone`
- `vendor_suffix`
- `warranty_period`
- `work_start_date`
- `ライセンス種別名`
- `原著作物名`
- `原著作物補記`
- `基本契約名`
- `対象製品予定名`
- `承継覚書日付`
- `特記事項`
- `監修者`
- `素材名`
- `素材権利者`
- `素材番号`
- `許諾開始日`
- `許諾期間注記`
- `金銭条件1_MG_AG`
- `金銭条件1_基準価格ラベル`
- `金銭条件1_支払条件`
- `金銭条件1_料率`
- `金銭条件1_計算式`
- `金銭条件1_計算方式`
- `金銭条件1_計算期間`
- `金銭条件1_地域言語ラベル`
- `金銭条件1_補足条件`
- `金銭条件1_通貨`
- `金銭条件2_MG_AG`
- `金銭条件2_概要`
- `金銭条件2_分配率`
- `金銭条件2_地域`
- `金銭条件2_支払条件`
- `金銭条件2_見出し`
- `金銭条件2_計算式`
- `金銭条件2_計算式注記`
- `金銭条件2_計算方式`
- `金銭条件2_補足条件`
- `金銭条件2_言語`
- `金銭条件2_通貨`
- `金銭条件3_MG_AG`
- `金銭条件3_概要`
- `金銭条件3_地域`
- `金銭条件3_支払条件`
- `金銭条件3_見出し`
- `金銭条件3_料率`
- `金銭条件3_計算式`
- `金銭条件3_計算式注記`
- `金銭条件3_計算方式`
- `金銭条件3_補足条件`
- `金銭条件3_言語`
- `金銭条件3_通貨`
