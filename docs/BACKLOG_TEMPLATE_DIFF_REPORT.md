# Backlog 設定 JSON と Template 定義の差分レポート

対象:
- Backlog 設定 JSON: `C:\Users\tatsuya.kuramochi\Downloads\Backlog-ProjectTemplate-LEGAL.json`
- Template 定義: `templates/definitions/*.json`

確認日:
- 2026-03-26

## 1. 全体サマリー

- Backlog カスタム属性数: `98`
- Template 定義が参照する `backlog.xxx` キー数: `159`
- Template 定義にはあるが Backlog 設定 JSON に存在しないキー数: `75`
- Backlog 設定 JSON にはあるが、Template 定義で未参照のキー数: `14`

注意:
- `missing 75` には、発注書系の未整備項目だけでなく、`license_ledger`、`payment_notice`、`royalty_report`、`revenue_share_report`、`nda` の未整備項目も含まれる。
- 現状の Template 群は、Backlog 設定 JSON より先に拡張された定義を含んでいる。

## 2. 発注書系の重要差分

### 2-1. `order.json` で不足している Backlog 項目

以下は Template 定義にあるが、Backlog 設定 JSON に存在しない。

| キー | Template での用途 | 影響 |
| --- | --- | --- |
| `contract_period` | 契約期間 | 備考固定文に出せない |
| `work_start_date` | 作業開始日 | 備考固定文に出せない |
| `remarks_free` | 備考自由記載 | 自由記載の備考欄が埋まらない |
| `show_order_sign_section` | 発注書署名欄表示 | 発注者/受注者の署名欄表示制御ができない |

### 2-2. `order.json` / `order_planning.json` で意味がずれている項目

| キー | Template 定義のラベル | Backlog JSON の説明 | コメント |
| --- | --- | --- | --- |
| `accept_by_performance` | 着手をもって承諾 | 成果物で検収 | 意味が異なる |
| `accept_required` | 承諾書面要否 | 検収要否 | 意味が異なる |
| `show_sign_section` | 受領署名欄表示 | 署名欄表示 | 粒度が曖昧 |
| `vendor_accept_type` | 受領方法 | 相手方承諾方法 | 用語差分あり |

### 2-3. `order.json` / `order_planning.json` で設計上不自然な項目

以下は Backlog ではなく、ローカルマスタまたは別 UI 入力に寄せる方が自然。

| Template 変数 | 現在の source | 問題 |
| --- | --- | --- |
| `STAFF_DEPARTMENT` | `user.name` | 部署なのに人名参照 |
| `STAFF_EMAIL` | `user.name` | メールなのに人名参照 |
| `STAFF_NAME` | `user.name` | 担当者名としては妥当だが分離不足 |
| `STAFF_PHONE` | `user.name` | 電話なのに人名参照 |

補足:
- Backlog 設定 JSON 側には `staff_department` はあるが、`staff_name` `staff_email` `staff_phone` はない。
- 現状のローカル UI には課題単位の文書修正画面がないため、Backlog に置く設計にした値は厳密に揃える必要がある。

## 3. Backlog に存在するが Template 未参照の項目

主な未参照項目:

- `attachment_url`
- `business_approval_status`
- `business_approver_slack_id`
- `counterparty_contact_name`
- `counterparty_email`
- `counterparty_name`
- `partner_code`
- `related_backlog_issue_key`
- `requested_due_date`
- `requester_department`
- `requester_name`
- `staff_department`
- `stamp_target_url`
- `workflow_label`

解釈:
- これらは文書テンプレートではなく、ワークフロー制御や依頼管理のための項目として使われている可能性が高い。
- ただし `staff_department` は発注書系 Template では使いたい項目なので、未参照は不自然。

## 4. Template 側にあるが Backlog 未整備の主要群

### 4-1. NDA 系

- `confidentiality_period`
- `contract_date_formatted`
- `contract_period`
- `nda_purpose`

### 4-2. 支払通知 / ロイヤリティ / レベニュー系

- `issue_date`
- `payment_date`
- `notice_date`
- `payment_due_date`
- `qty`
- `date`
- `detail`
- `rate`
- `baseamount`
- `calculation`
- `note`
- `period`
- `minimum_guarantee`
- `special_note`
- `revshare_basis`
- `revshare_note`
- `sender_address`
- `sender_dept`
- `sender_name`
- `sender_zip`
- `unit_price`

### 4-3. ライセンス台帳系

以下はほぼ一式未整備:

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
- `金銭条件1_*`
- `金銭条件2_*`
- `金銭条件3_*`

## 5. 優先順位

### 優先度A

まず揃えるべき項目:

- `contract_period`
- `work_start_date`
- `remarks_free`
- `show_order_sign_section`
- `staff_name`
- `staff_email`
- `staff_phone`

### 優先度B

意味を揃えるべき項目:

- `accept_by_performance`
- `accept_required`
- `show_sign_section`
- `vendor_accept_type`

### 優先度C

Template を使うなら Backlog に追加が必要な群:

- `nda.json` 用項目
- `payment_notice.json` 用項目
- `royalty_report.json` 用項目
- `revenue_share_report.json` 用項目
- `license_ledger.json` 用項目

## 6. 現時点の結論

- 発注書系 Template は、Backlog 設定 JSON と完全一致していない。
- 現在の Backlog 設定だけでは、発注書の一部項目は埋まらない。
- 特に `order.json` は「備考固定文」「自由備考」「発注書署名欄」「担当者情報」で差分がある。
- 他 Template も含めると、Template 定義の方が Backlog 設定より広く、現状の Backlog 設定では全テンプレートを運用できない。

## 7. 次アクション案

1. 発注書系だけを先に運用対象として、Backlog 項目を追加する
2. `staff_*` は Backlog ではなくローカル `user` マスタ参照へ整理する
3. NDA / 支払通知 / ロイヤリティ / レベニュー / ライセンス台帳は、Backlog 項目整備前提で別フェーズに切る
4. その後、Template 定義を「Backlog 由来」「DB マスタ由来」「自動値」で再整理する
