# Backlog 追加項目計画（残りテンプレート）

確認日:
- 2026-03-26

前提:
- 発注書系 (`order`, `order_planning`) は Backlog カスタム属性上は作成可能になった
- まだ作成不可のテンプレートは以下 6 件

対象:
- `license_basic`
- `license_ledger`
- `nda`
- `payment_notice`
- `revenue_share_report`
- `royalty_report`

## 1. 優先度

### 優先度A

少数追加で使えるようになるテンプレート:

- `license_basic`
- `nda`
- `royalty_report`

### 優先度B

中規模追加が必要:

- `revenue_share_report`
- `payment_notice`

### 優先度C

大規模追加が必要:

- `license_ledger`

## 2. テンプレート別不足項目

### 2-1. license_basic

不足: 1 件

| name | type | required | 用途 |
| --- | --- | --- | --- |
| `承継覚書日付` | `string` or `date` | false | 承継覚書の追記日付 |

推奨:
- 日付として扱うなら `date`
- 文字列の柔軟性を優先するなら `string`

### 2-2. nda

不足: 3 件

| name | type | required | 用途 |
| --- | --- | --- | --- |
| `confidentiality_period` | `string` | true | 秘密保持期間 |
| `contract_date_formatted` | `string` | true | 契約日表示用 |
| `nda_purpose` | `text` | true | NDA の目的 |

推奨:
- `contract_date_formatted` は本来 `contract_date` から自動整形できるなら Backlog 不要
- ただし現定義を優先するなら追加

### 2-3. royalty_report

不足: 5 件

| name | type | required | 用途 |
| --- | --- | --- | --- |
| `issue_date` | `date` | true | 発行日 |
| `date` | `date` or `string` | true | 明細日付 |
| `detail` | `text` | true | 明細内容 |
| `qty` | `number` | true | 数量 |
| `rate` | `string` or `number` | true | 料率 |

### 2-4. revenue_share_report

不足: 10 件

| name | type | required | 用途 |
| --- | --- | --- | --- |
| `issue_date` | `date` | true | 発行日 |
| `minimum_guarantee` | `number` | false | 最低保証額 |
| `payment_date` | `date` | true | 支払日 |
| `special_note` | `text` | false | 特記事項 |
| `baseamount` | `number` | true | 基礎額 |
| `calculation` | `text` | true | 計算内容 |
| `detail` | `text` | true | 明細内容 |
| `note` | `text` | true | 備考 |
| `period` | `string` | true | 計算期間 |
| `rate` | `string` or `number` | true | 分配率 |

### 2-5. payment_notice

不足: 13 件

| name | type | required | 用途 |
| --- | --- | --- | --- |
| `revshare_basis` | `text` | true | レベニューシェア算出基準 |
| `revshare_note` | `text` | true | レベニューシェア備考 |
| `sender_address` | `string` | true | 送付者住所 |
| `sender_dept` | `string` | true | 送付者部署 |
| `sender_name` | `string` | true | 送付者名 |
| `sender_zip` | `string` | true | 送付者郵便番号 |
| `notice_date` | `date` | true | 通知日 |
| `payment_due_date` | `date` | true | 支払期限 |
| `date` | `date` or `string` | true | 明細日付 |
| `qty` | `number` | true | 数量 |
| `unit_price` | `number` | true | 単価 |

補足:
- `revshare_basis`, `revshare_note` は定義上 top-level と delivery 側で重複参照している
- Backlog 項目としては 1 つずつあればよい

### 2-6. license_ledger

不足: 46 件

主な不足群:

基本情報・対象情報:
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

金銭条件1:
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

金銭条件2:
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

金銭条件3:
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

## 3. 実施順序

1. `license_basic` を追加
2. `nda` を追加
3. `royalty_report` を追加
4. `revenue_share_report` を追加
5. `payment_notice` を追加
6. `license_ledger` は最後にまとめて追加

## 4. 実務上の判断ポイント

- `contract_date_formatted` のような整形値は Backlog に置くよりアプリ側生成が自然
- `license_ledger` の日本語キー群は運用管理上やや重い
- `payment_notice` の `sender_*` は Backlog ではなく固定値 / user / company 情報に寄せてもよい
- `royalty_report` / `revenue_share_report` の item 系項目は、課題単体で持つか、CSV・別明細入力に寄せるか要判断

## 5. 現時点の結論

- すぐ使えるのは 7 テンプレート
- 残り 6 テンプレートは Backlog 項目追加が必要
- 最短で使えるようにするなら `license_basic` → `nda` → `royalty_report` の順がよい
