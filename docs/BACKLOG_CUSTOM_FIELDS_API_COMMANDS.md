# Backlog カスタム属性 更新コマンド

対象:
- `発注書`
- `企画発注書`

実行スクリプト:
- [backlog-update-order-fields.ps1](/C:/Users/tatsuya.kuramochi/Documents/GitHub/Legal_Bridge_backLog-main/scripts/backlog-update-order-fields.ps1)

## 実行前提

以下の環境変数が設定されていること:

- `BACKLOG_SPACE`
- `BACKLOG_PROJECT_ID`
- `BACKLOG_API_KEY`

## 実行コマンド

PowerShell:

```powershell
Set-Location 'C:\Users\tatsuya.kuramochi\Documents\GitHub\Legal_Bridge_backLog-main'
.\scripts\backlog-update-order-fields.ps1
```

## このスクリプトで行うこと

### 追加

- `contract_period`
- `work_start_date`
- `remarks_free`
- `show_order_sign_section`
- `staff_name`
- `staff_email`
- `staff_phone`

### description 更新

- `accept_by_performance` -> `着手をもって承諾`
- `accept_required` -> `承諾書面要否`
- `show_sign_section` -> `受領署名欄表示`
- `vendor_accept_type` -> `受領方法`

## 注意

- 既存項目は上書きせず、存在する場合は `SKIP`
- 既存項目の `description` は `PATCH`
- `発注書` と `企画発注書` の issue type に紐付けて作成
