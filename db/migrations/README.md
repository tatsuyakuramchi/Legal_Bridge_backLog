# LegalBridge — DB マイグレーション

## ファイル構成

```
migrations/
├── 000_create_migration_management.sql  ← 管理テーブル（自動実行）
├── 001_create_users.sql                 ← ユーザーマスタ
├── 002_create_partners.sql              ← 取引先マスタ
├── 003_create_contracts.sql             ← 契約マスタ（中心テーブル）
├── 004_create_documents.sql             ← 生成文書台帳
├── 005_create_deliveries.sql            ← 納品管理・納品明細
├── 006_create_royalties.sql             ← 利用許諾料実績・スケジュール
├── 007_create_sublicenses.sql           ← サブライセンス情報
├── 008_create_contract_alerts.sql       ← アラート記録
├── 009_create_polling_logs.sql          ← ポーリングログ
├── 010_create_indexes_and_constraints.sql ← 追加インデックス・ビュー
└── run_migrations.sh                    ← 実行スクリプト
```

## 初回セットアップ手順

### 1. RDSにDBを作成

```bash
psql -h {RDSエンドポイント} -U postgres -d postgres
```

```sql
CREATE DATABASE arclight_legal;
CREATE USER legal_app WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE arclight_legal TO legal_app;
\q
```

### 2. .envを準備

```
RDS_HOST=xxxx.ap-northeast-1.rds.amazonaws.com
RDS_PORT=5432
RDS_DB=arclight_legal
RDS_USER=legal_app
RDS_PASSWORD=your_password_here
```

### 3. マイグレーションを実行

```bash
cd migrations
chmod +x run_migrations.sh

# 全部実行
./run_migrations.sh

# 適用状況を確認
./run_migrations.sh --status
```

---

## 後からテーブルやカラムを追加したいとき

新しいSQLファイルを作って実行するだけです。

```bash
# 例：saiyouというカラムをcontractsに追加したい場合
cat > migrations/011_add_contract_priority.sql << 'EOF'
-- 011_add_contract_priority.sql
-- contractsテーブルに優先度カラムを追加

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal';

COMMENT ON COLUMN contracts.priority IS '優先度: high / normal / low';
EOF

# 実行（011だけが適用される）
./run_migrations.sh
```

---

## よく使うコマンド

```bash
# 適用状況確認
./run_migrations.sh --status

# 実行せずに適用予定を確認
./run_migrations.sh --dry-run

# 003番まで実行（段階的に適用したい場合）
./run_migrations.sh 003

# TablePlusで直接確認（接続後）
SELECT * FROM schema_migrations ORDER BY version;
```

---

## マイグレーション番号のルール

| 範囲 | 用途 |
|---|---|
| 000 | 管理テーブル（自動） |
| 001–009 | 初期テーブル作成 |
| 010–019 | インデックス・ビュー・制約 |
| 020–099 | カラム追加・変更 |
| 100– | 大規模な変更・リファクタリング |

---

## 注意事項

- **既に適用済みのファイルは修正しない**こと。新しいファイルを追加する。
- `ALTER TABLE` で `IF NOT EXISTS` / `IF EXISTS` を必ず使う（冪等性を保つ）。
- 本番適用前は必ずローカルDBでテストする。
