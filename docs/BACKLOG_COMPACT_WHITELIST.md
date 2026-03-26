# Backlog Compact Whitelist

## 方針

- 上限 100 件に収めるための最終 whitelist
- `license_ledger` は Backlog 管理対象から外す
- `service_basic` は `contract_date` と `remarks` に整理する
- `order` / `order_planning` は `order_date` 1 項目へ統一する
- `staff_*` は `users` テーブルから取得する

## 実行コマンド

```powershell
Set-Location 'C:\Users\tatsuya.kuramochi\Documents\GitHub\Legal_Bridge_backLog-main'

$env:BACKLOG_SPACE='arclight'
$env:BACKLOG_PROJECT_ID='LEGAL'
$env:BACKLOG_API_KEY='YOUR_API_KEY'

node .\scripts\backlog-apply-compact-whitelist.mjs
node .\scripts\backlog-apply-compact-whitelist.mjs --apply
```

## 追加される項目

- `baseamount`
- `calculation`
- `deduction`
- `deduction_note`
- `minimum_guarantee`
- `order_date`
- `payment_date`
- `payment_due_date`
- `period`
- `period_text`
- `revshare_basis`
- `revshare_note`
- `special_note`
- `unit_price`

## 削除される項目

- `contract_date_day`
- `contract_date_formatted`
- `contract_date_month`
- `contract_date_year`
- `has_remarks`
- `order_date_day`
- `order_date_month`
- `order_date_year`
- `remarks_free`
- `staff_email`
- `staff_name`
- `staff_phone`
- `vendor_phone`
- `vendor_suffix`

## 最終 whitelist

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
- `contract_period`
- `credit_name`
- `cure_period_days`
- `date`
- `deduction`
- `deduction_note`
- `delivery_date`
- `delivery_days_after_payment`
- `delivery_fee_threshold`
- `delivery_location`
- `delivery_type`
- `delivery_url`
- `deposit_replenish_days`
- `detail`
- `final_deadline`
- `first_draft_deadline`
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
- `notes`
- `order_date`
- `original_author`
- `original_work`
- `originalamount`
- `partial_number`
- `pay_method`
- `payment_condition_summary`
- `payment_date`
- `payment_due_date`
- `payment_due_day`
- `payment_method`
- `payment_terms`
- `period`
- `period_text`
- `person_department`
- `person_name`
- `prepay_deadline_days`
- `product_scope`
- `project_name`
- `project_title`
- `qty`
- `rate`
- `remarks`
- `reviewer_department`
- `reviewer_name`
- `revisiondetail`
- `revshare_basis`
- `revshare_note`
- `security_deposit_amount`
- `show_order_sign_section`
- `show_sign_section`
- `spec`
- `special_note`
- `special_terms`
- `thistimequantity`
- `totalquantity`
- `transfer_fee_payer`
- `unit_price`
- `unitprice`
- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_accept_type`
- `vendor_contact_department`
- `warranty_period`
- `work_start_date`
- `承継覚書日付`
