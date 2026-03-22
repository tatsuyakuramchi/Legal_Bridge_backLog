#!/bin/bash
# ============================================================
# run_migrations.sh
# マイグレーションを順番に実行するスクリプト
#
# 使い方:
#   ./run_migrations.sh                  # 未適用のマイグレーションを全部実行
#   ./run_migrations.sh 003              # 003番まで実行
#   ./run_migrations.sh --status         # 適用状況を確認
#   ./run_migrations.sh --dry-run        # 実行せずに適用予定を表示
# ============================================================

set -e  # エラーで即停止

# ─── 設定（.envから読み込む）────────────────────────────────
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_HOST="${RDS_HOST:-localhost}"
DB_PORT="${RDS_PORT:-5432}"
DB_NAME="${RDS_DB:-arclight_legal}"
DB_USER="${RDS_USER:-legal_app}"
PGPASSWORD="${RDS_PASSWORD}"
export PGPASSWORD

MIGRATIONS_DIR="$(dirname "$0")/migrations"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

# ─── 色付き出力 ──────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo_ok()   { echo -e "${GREEN}✓${NC} $1"; }
echo_skip() { echo -e "${YELLOW}–${NC} $1"; }
echo_err()  { echo -e "${RED}✕${NC} $1"; }

# ─── 接続確認 ────────────────────────────────────────────────
echo "接続確認: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
if ! $PSQL -c "SELECT 1" > /dev/null 2>&1; then
  echo_err "RDSへの接続に失敗しました。.envのRDS_*設定を確認してください。"
  exit 1
fi

# ─── schema_migrationsテーブルの確認・作成 ───────────────────
$PSQL -f "$MIGRATIONS_DIR/000_create_migration_management.sql" > /dev/null 2>&1 || true

# ─── ステータス表示モード ─────────────────────────────────────
if [ "$1" = "--status" ]; then
  echo ""
  echo "=== マイグレーション適用状況 ==="
  $PSQL -c "
    SELECT version, description, TO_CHAR(applied_at, 'YYYY-MM-DD HH24:MI') AS applied_at
    FROM schema_migrations
    ORDER BY version;
  "
  echo ""
  echo "=== 未適用のマイグレーション ==="
  for sql_file in "$MIGRATIONS_DIR"/[0-9]*.sql; do
    version=$(basename "$sql_file" | cut -d_ -f1)
    [ "$version" = "000" ] && continue
    applied=$($PSQL -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version='$version'" 2>/dev/null)
    if [ "$applied" = "0" ]; then
      echo "  未適用: $(basename $sql_file)"
    fi
  done
  exit 0
fi

# ─── マイグレーション実行 ─────────────────────────────────────
TARGET_VERSION="${1:-999}"  # 引数がなければ全部実行
DRY_RUN=0
[ "$1" = "--dry-run" ] && DRY_RUN=1 && TARGET_VERSION="999"

echo ""
echo "=== マイグレーション実行 ==="
APPLIED=0
SKIPPED=0
ERRORS=0

for sql_file in "$MIGRATIONS_DIR"/[0-9]*.sql; do
  version=$(basename "$sql_file" | cut -d_ -f1)
  description=$(basename "$sql_file" | sed 's/^[0-9]*_//' | sed 's/\.sql$//')

  # 000はスキップ（既に実行済み）
  [ "$version" = "000" ] && continue

  # ターゲットバージョンを超えたらストップ
  if [[ "$version" > "$TARGET_VERSION" ]]; then
    break
  fi

  # 適用済みチェック
  applied=$($PSQL -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version='$version'" 2>/dev/null || echo "0")
  if [ "$applied" != "0" ]; then
    echo_skip "$version: $description（適用済みのためスキップ）"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "  [DRY RUN] 適用予定: $version - $description"
    continue
  fi

  # 実行
  echo -n "  適用中: $version - $description ... "
  if $PSQL -f "$sql_file" > /tmp/migration_output.txt 2>&1; then
    $PSQL -c "INSERT INTO schema_migrations (version, description) VALUES ('$version', '$description')" > /dev/null
    echo_ok "完了"
    APPLIED=$((APPLIED + 1))
  else
    echo_err "失敗"
    cat /tmp/migration_output.txt
    ERRORS=$((ERRORS + 1))
    echo ""
    echo_err "マイグレーション $version でエラーが発生しました。処理を中断します。"
    exit 1
  fi
done

echo ""
echo "=== 完了 ==="
echo "  適用: ${APPLIED}件 / スキップ: ${SKIPPED}件 / エラー: ${ERRORS}件"
if [ "$APPLIED" -gt 0 ]; then
  echo ""
  echo "現在のスキーマ状態:"
  $PSQL -c "SELECT version, description FROM schema_migrations ORDER BY version;"
fi
