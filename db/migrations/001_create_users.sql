-- ============================================================
-- 001_create_users.sql
-- ユーザーマスタ（Slack APIから自動同期）
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  slack_id              VARCHAR(20)  UNIQUE NOT NULL,       -- Slack User ID（例：U01ABC123）
  name                  VARCHAR(100) NOT NULL,              -- 表示名（Slack real_name）
  department            VARCHAR(100),                       -- 部署名
  title                 VARCHAR(100),                       -- 役職
  google_email          VARCHAR(200),                       -- Googleアカウントのメール
  is_legal_approver     BOOLEAN NOT NULL DEFAULT FALSE,     -- 法務責任者フラグ（承認Block Kitが届く）
  is_business_approver  BOOLEAN NOT NULL DEFAULT FALSE,     -- 事業部責任者フラグ（押印申請承認）
  is_legal_staff        BOOLEAN NOT NULL DEFAULT FALSE,     -- 法務担当者フラグ（Backlog担当者候補）
  is_admin              BOOLEAN NOT NULL DEFAULT FALSE,     -- 管理WebUIアクセス権
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,      -- 有効フラグ（falseなら通知・フローから除外）
  notify_via_dm         BOOLEAN NOT NULL DEFAULT TRUE,      -- trueでDM、falseでチャンネルメンション
  notes                 TEXT,                               -- 備考（管理WebUIで設定）
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Slack同期時のインデックス
CREATE INDEX IF NOT EXISTS idx_users_slack_id    ON users(slack_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_is_approver ON users(is_legal_approver);

COMMENT ON TABLE users IS 'ユーザーマスタ。毎日04:00にSlack APIから自動同期。権限フラグのみ管理WebUIで手動設定可能。';
