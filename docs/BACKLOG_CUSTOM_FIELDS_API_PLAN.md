# Backlog カスタム属性 API 更新用まとめ

対象:
- `C:\Users\tatsuya.kuramochi\Downloads\Backlog-ProjectTemplate-LEGAL.json`
- `templates/definitions/*.json`

目的:
- Backlog のカスタム属性を API で一括調整するための作業リスト
- まずは「発注書」「企画発注書」を運用できる状態に揃える

## 1. 方針

- Backlog に置く
  - 案件ごとに変わる入力値
  - 文書出力に直接使う値
- DB マスタに置く
  - 相手方固定情報
  - 社内担当者固定情報
- `fixed:company`
  - 自社固定値

重要:
- Backlog の項目名は `project_title` のような実キーで作成する
- 日本語ラベルは `description` 側で管理する
- まだデータ未投入なので、不要項目はこの段階で整理してよい

## 2. 最優先対象

対象種別:
- `発注書`
- `企画発注書`

この2種別が正常に出力できることを優先する。

## 3. 追加する項目

以下は Template 定義に存在するが、現在の Backlog 設定 JSON に存在しない。

### 3-1. 発注書 / 企画発注書

| name | description | type | required | issueTypes |
| --- | --- | --- | --- | --- |
| `contract_period` | 契約期間 | `text` | false | `発注書`, `企画発注書` |
| `work_start_date` | 作業開始日 | `date` | false | `発注書`, `企画発注書` |
| `remarks_free` | 備考自由記載 | `text` | false | `発注書`, `企画発注書` |
| `show_order_sign_section` | 発注書署名欄表示 | `checkbox` | false | `発注書`, `企画発注書` |

### 3-2. 担当者情報

以下は Template 運用上は必要だが、Backlog に置くか DB マスタに置くかを決める必要がある。

Backlog に置く場合:

| name | description | type | required | issueTypes |
| --- | --- | --- | --- | --- |
| `staff_name` | 自社担当者名 | `string` | false | `発注書`, `企画発注書` |
| `staff_email` | 自社担当者メール | `string` | false | `発注書`, `企画発注書` |
| `staff_phone` | 自社担当者電話番号 | `string` | false | `発注書`, `企画発注書` |

推奨:
- これらは本来 `user` マスタ寄せが自然
- ただしローカル側に課題単位の修正 UI がないため、運用簡便性を優先するなら Backlog に置いてもよい

## 4. 意味を見直す項目

以下は存在しているが、Template 側の意味と Backlog 側の説明がずれている。

| name | 現在の description | Template 上の意味 | 対応方針 |
| --- | --- | --- | --- |
| `accept_by_performance` | 成果物で検収 | 着手をもって承諾 | どちらに寄せるか決めて description とテンプレートを統一 |
| `accept_required` | 検収要否 | 承諾書面要否 | 項目の意味を再定義 |
| `show_sign_section` | 署名欄表示 | 受領署名欄表示 | 受領署名専用に寄せるか確認 |
| `vendor_accept_type` | 相手方承諾方法 | 受領方法 | 用語を統一 |

推奨:
- まずは Template 側の用途に合わせて description を直す
- もし意味自体を変えるなら Template 定義も同時修正

## 5. 現状維持でよい項目

以下は発注書系で既に揃っている。

| name | description |
| --- | --- |
| `transfer_fee_payer` | 振込手数料負担 |
| `accept_method` | 検収方法 |
| `accept_reply_due_date` | 検収回答期限 |
| `bank_info` | 振込先情報 |
| `delivery_date` | 納品日 |
| `item_name` | 件名 |
| `master_contract_ref` | 基本契約参照番号 |
| `order_date_year` | 発注年 |
| `order_date_month` | 発注月 |
| `order_date_day` | 発注日 |
| `payment_terms` | 支払条件 |
| `project_title` | 案件名 |
| `special_terms` | 特約 |
| `vendor_accept_date` | 相手方承諾日 |
| `vendor_accept_name` | 相手方承諾者名 |
| `vendor_contact_department` | 相手方担当部署 |
| `vendor_suffix` | 相手方敬称 |
| `amount` | 金額 |
| `category` | 区分 |
| `pay_method` | 支払方法 |
| `first_draft_deadline` | 初稿期限 |
| `final_deadline` | 最終納期 |

## 6. 発注書系の最終候補セット

API で再構成するなら、発注書系は次を最終セット候補とする。

### 6-1. 基本情報

- `project_title`
- `item_name`
- `master_contract_ref`
- `vendor_contact_department`
- `vendor_suffix`
- `staff_department`
- `staff_name`
- `staff_email`
- `staff_phone`

### 6-2. 期日情報

- `order_date_year`
- `order_date_month`
- `order_date_day`
- `delivery_date`
- `accept_reply_due_date`
- `work_start_date`
- `contract_period`
- `first_draft_deadline`
- `final_deadline`

### 6-3. 支払情報

- `payment_terms`
- `bank_info`
- `transfer_fee_payer`
- `pay_method`
- `amount`

### 6-4. 文書制御 / 条件

- `accept_method`
- `accept_by_performance`
- `accept_required`
- `show_sign_section`
- `show_order_sign_section`
- `vendor_accept_type`
- `vendor_accept_date`
- `vendor_accept_name`
- `category`
- `remarks`
- `remarks_free`
- `special_terms`

## 7. API 更新時の実施内容

### 7-1. 追加

- `contract_period`
- `work_start_date`
- `remarks_free`
- `show_order_sign_section`
- 必要なら `staff_name`
- 必要なら `staff_email`
- 必要なら `staff_phone`

### 7-2. description 更新

- `accept_by_performance`
- `accept_required`
- `show_sign_section`
- `vendor_accept_type`

### 7-3. required 見直し

現在の運用想定では、以下は `required: false` のままでよい。

- `vendor_accept_date`
- `vendor_accept_name`
- `vendor_contact_department`
- `vendor_suffix`
- `remarks`
- `remarks_free`
- `contract_period`
- `work_start_date`
- `show_sign_section`
- `show_order_sign_section`

### 7-4. issue type 適用

発注書系項目は原則として次のどちらかに付与する。

- `発注書`
- `企画発注書`

`企画発注書` 専用:
- `first_draft_deadline`
- `final_deadline`

## 8. API 用の型対応メモ

既存スクリプトの型名:

- `string` -> Backlog `typeId: 1`
- `text` -> Backlog `typeId: 2`
- `number` -> Backlog `typeId: 3`
- `date` -> Backlog `typeId: 4`
- `single_list` -> Backlog `typeId: 5`
- `checkbox` -> Backlog `typeId: 7`

## 9. 実行順序

1. 発注書 / 企画発注書の追加項目を API で作成
2. 既存項目の description を API で更新
3. 必要に応じて `staff_name` `staff_email` `staff_phone` を追加
4. その後 Template 側の `staff_*` 参照先を確定
5. 発注書テスト出力で確認

## 10. 保留項目

以下は発注書系の調整後に別途整理する。

- `nda.json` 用項目
- `payment_notice.json` 用項目
- `royalty_report.json` 用項目
- `revenue_share_report.json` 用項目
- `license_ledger.json` 用項目

理由:
- Backlog 設定 JSON に対して Template 側の要求項目が多く、発注書系と同時に詰めると整理が崩れやすい
