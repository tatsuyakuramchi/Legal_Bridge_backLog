# Backlog 設定一覧

この一覧は、ローカルアプリが実際に参照しているテンプレート定義をもとに整理した最終版です。

参照元:
- `templates/definitions/order.json`
- `templates/definitions/order_planning.json`
- `templates/definitions/service_basic.json`
- `templates/definitions/license_basic.json`

## 1. 前提

- アプリが Backlog 側で参照するのは `種別` と `カスタム属性` です。
- `カテゴリー` は現在のコードでは参照していません。
- そのため、`カテゴリー` は運用整理用であり、アプリ必須ではありません。
- `partner.xxx` は Backlog ではなく取引先マスタです。
- `user.xxx` は Backlog ではなくユーザーマスタです。
- `fixed:company` は自社固定値です。
- `auto` はアプリ側の自動採番です。
- `manual` はアプリ入力寄りの項目です。

つまり、Backlog に作るべきものは `source` が `backlog.xxx` の項目です。

重要:

- Backlog のカスタム属性には `表示名` と `実キー` の別管理はありません。
- このアプリは Backlog API の `customFields[].name` を見ています。
- そのため、Backlog の `項目名` には日本語ラベルではなく `project_title` のような実キー名をそのまま入力してください。

## 2. 種別

Backlog 画面では `課題タイプ` ではなく `種別` です。

作成する種別:

| 表示名 |
| --- |
| 業務委託基本契約 |
| ライセンス契約 |
| NDA |
| 発注書 |
| 企画発注書 |
| 売買契約（当社買手） |
| 売買契約（当社売手・標準） |
| 売買契約（当社売手・保証金掛け売り） |
| 納品リクエスト |

## 3. 状態

最低限作る状態:

| 表示名 |
| --- |
| 草案 |
| レビュー中 |
| 承認待ち |
| 相手方確認待ち |
| 押印依頼中 |
| 締結済 |
| 完了 |
| 破棄 |

## 4. カテゴリー

カテゴリーは任意です。使うなら次の分け方が自然です。

| カテゴリー名 |
| --- |
| 契約 |
| 発注 |
| 納品 |
| 売買 |
| ライセンス |

## 5. 業務委託基本契約

対象種別: `業務委託基本契約`

| Backlog の項目名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| 契約年 | 数値 | 必須 | `contract_date_year` |
| 契約月 | 数値 | 必須 | `contract_date_month` |
| 契約日 | 数値 | 必須 | `contract_date_day` |
| 備考 | 複数行テキスト | 任意 | `remarks` |
| 相手方電話番号 | 文字列 | 必須 | `vendor_phone` |

## 6. ライセンス契約

対象種別: `ライセンス契約`

| Backlog の項目名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| クレジット表記 | 文字列 | 任意 | `credit_name` |
| 備考条項あり | チェックボックス | 任意 | `has_remarks` |
| 管轄 | 文字列 | 必須 | `jurisdiction` |
| 原著作者 | 文字列 | 任意 | `original_author` |
| 原著作物 | 文字列 | 必須 | `original_work` |

## 7. 発注書

対象種別: `発注書`

### 7-1. 基本情報

| Backlog の項目名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| 振込手数料負担 | 選択リスト | 任意 | `transfer_fee_payer` |
| 成果物で検収 | チェックボックス | 任意 | `accept_by_performance` |
| 検収要否 | チェックボックス | 任意 | `accept_required` |
| 署名欄表示 | チェックボックス | 任意 | `show_sign_section` |
| 相手方承諾方法 | 選択リスト | 任意 | `vendor_accept_type` |

### 7-2. 発注・納品情報

| Backlog の項目名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| 検収方法 | 選択リスト | 必須 | `accept_method` |
| 検収回答期限 | 日付 | 任意 | `accept_reply_due_date` |
| 振込先情報 | 複数行テキスト | 必須 | `bank_info` |
| 納品日 | 日付 | 必須 | `delivery_date` |
| 件名 | 文字列 | 必須 | `item_name` |
| 基本契約参照番号 | 文字列 | 必須 | `master_contract_ref` |
| 発注年 | 数値 | 必須 | `order_date_year` |
| 発注月 | 数値 | 必須 | `order_date_month` |
| 発注日 | 数値 | 必須 | `order_date_day` |
| 支払条件 | 複数行テキスト | 必須 | `payment_terms` |
| プロジェクト名 | 文字列 | 必須 | `project_title` |
| 備考 | 複数行テキスト | 任意 | `remarks` |
| 特約 | 複数行テキスト | 任意 | `special_terms` |
| 相手方承諾日 | 日付 | 任意 | `vendor_accept_date` |
| 相手方承諾者名 | 文字列 | 任意 | `vendor_accept_name` |
| 相手方担当部署 | 文字列 | 任意 | `vendor_contact_department` |
| 相手方敬称 | 文字列 | 任意 | `vendor_suffix` |

### 7-3. 明細

| Backlog の項目名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| 金額 | 数値 | 必須 | `amount` |
| 区分 | 選択リスト | 必須 | `category` |
| 支払方法 | 選択リスト | 必須 | `pay_method` |

## 8. 企画発注書

対象種別: `企画発注書`

`発注書` の項目に加えて、次を追加します。

| 表示名 | 推奨型 | 必須 | 実キー |
| --- | --- | --- | --- |
| 初稿期限 | 日付 | 必須 | `first_draft_deadline` |
| 最終納期 | 日付 | 必須 | `final_deadline` |

## 9. 先に作るべき最小セット

最初に Backlog へ作るなら次だけで十分です。

| Backlog の項目名 | 推奨型 | 実キー |
| --- | --- | --- |
| プロジェクト名 | 文字列 | `project_title` |
| 基本契約参照番号 | 文字列 | `master_contract_ref` |
| 支払条件 | 複数行テキスト | `payment_terms` |
| 納品日 | 日付 | `delivery_date` |
| 検収要否 | チェックボックス | `accept_required` |
| 検収方法 | 選択リスト | `accept_method` |
| 件名 | 文字列 | `item_name` |
| 金額 | 数値 | `amount` |
| 区分 | 選択リスト | `category` |
| 支払方法 | 選択リスト | `pay_method` |
| 備考 | 複数行テキスト | `remarks` |

## 10. 選択リストの候補例

`accept_method`

| 値 |
| --- |
| メール |
| Slack |
| 書面 |
| 検収不要 |

`category`

| 値 |
| --- |
| 制作 |
| 監修 |
| デザイン |
| ライセンス |
| その他 |

`pay_method`

| 値 |
| --- |
| 一括払い |
| 分割払い |
| サブスクリプション |
| 業績連動 |
| 検収後支払 |

## 11. Backlog 画面での作成場所

### 11-1. 種別

1. 対象プロジェクトを開く
2. `プロジェクト設定`
3. `課題`
4. `種別`
5. `追加`

### 11-2. 状態

1. 対象プロジェクトを開く
2. `プロジェクト設定`
3. `課題`
4. `状態`
5. `追加`

### 11-3. カテゴリー

1. 対象プロジェクトを開く
2. `プロジェクト設定`
3. `課題`
4. `カテゴリー`
5. `追加`

### 11-4. カスタム属性

1. 対象プロジェクトを開く
2. `プロジェクト設定`
3. `課題`
4. `カスタム属性`
5. `追加`

## 12. 補足

- Backlog では項目名がそのまま API 上の `name` として返るため、このアプリでは `project_title` のような実キー名で作る必要があります。
- 売買契約系、検収書系、支払通知系の definitions には文字化けと JSON 崩れがあり、機械抽出が不安定です。
- そのため、この一覧は運用開始に必要な主要系統を優先して整理しています。

## 13. API での自動作成

このリポジトリには Backlog の `種別` と `カスタム属性` を自動作成する CLI を追加しています。

コマンド:

```powershell
npm.cmd run backlog:sync-fields -- --dry-run
```

実際に反映する場合:

```powershell
npm.cmd run backlog:sync-fields -- --apply
```

カスタム属性だけ反映する場合:

```powershell
npm.cmd run backlog:sync-fields -- --apply --custom-fields-only
```

実装:
- `scripts/sync-backlog-custom-fields.ts`
- `src/backlogSetupCatalog.ts`
