-- ============================================================
-- 000_create_migration_management.sql
-- マイグレーション管理テーブル（最初に実行する）
-- ============================================================
-- ※ このファイルは番号が000なので最初に実行すること
--   または手動で一度だけ実行する

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20) PRIMARY KEY,   -- マイグレーション番号（例：001）
  description VARCHAR(200),             -- 説明
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migrations IS 'マイグレーション適用済み記録。run_migrations.shが管理する。';
