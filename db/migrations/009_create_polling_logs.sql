-- ============================================================
-- 009_create_polling_logs.sql
-- ポーリング処理ログ・最終チェック時刻管理
-- ============================================================

-- ポーリング状態管理（最終チェック時刻）
CREATE TABLE IF NOT EXISTS polling_state (
  id                 INTEGER PRIMARY KEY DEFAULT 1,  -- 常に1行のみ
  last_checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '1 hour',
  last_issue_count   INTEGER NOT NULL DEFAULT 0,     -- 前回取得した課題数
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)     -- 1行のみ許可
);

-- 初期レコード挿入（idが1のレコードを常に保持）
INSERT INTO polling_state (id, last_checked_at)
VALUES (1, NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ポーリング処理ログ（デバッグ・監査用）
CREATE TABLE IF NOT EXISTS polling_logs (
  id              SERIAL PRIMARY KEY,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issues_fetched  INTEGER NOT NULL DEFAULT 0,   -- 取得した課題数
  issues_processed INTEGER NOT NULL DEFAULT 0,  -- 処理した課題数（ステータス変化あり）
  duration_ms     INTEGER,                       -- 処理時間（ミリ秒）
  error_message   TEXT,                          -- エラーがあった場合のメッセージ
  status          VARCHAR(20) NOT NULL DEFAULT 'success'  -- success / error / partial
);

-- 古いログは自動削除（30日分のみ保持）
CREATE INDEX IF NOT EXISTS idx_polling_logs_checked_at ON polling_logs(checked_at DESC);

COMMENT ON TABLE  polling_state             IS 'Backlogポーリングの最終チェック時刻。常に1行のみ。';
COMMENT ON TABLE  polling_logs              IS 'ポーリング処理の実行ログ。デバッグ・監査用。30日保持。';
COMMENT ON COLUMN polling_logs.status       IS 'success=正常 / error=全件エラー / partial=一部エラー';
