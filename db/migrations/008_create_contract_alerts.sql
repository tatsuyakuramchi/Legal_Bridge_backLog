-- ============================================================
-- 008_create_contract_alerts.sql
-- 契約期限アラート記録（重複送信防止）
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_alerts (
  id           SERIAL PRIMARY KEY,
  contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  alert_type   VARCHAR(50) NOT NULL,    -- expiry_90days / expiry_30days / delivery_7days / royalty_7days / royalty_due / royalty_overdue
  alert_date   DATE NOT NULL,           -- アラートを送信した日付
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slack_channel VARCHAR(50),            -- 送信先チャンネルまたはユーザーID
  message_ts   VARCHAR(50),             -- SlackメッセージのTS（リマインダー用）
  UNIQUE (contract_id, alert_type, alert_date)  -- 同日・同種のアラートは1回のみ
);

CREATE INDEX IF NOT EXISTS idx_contract_alerts_contract   ON contract_alerts(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_alerts_type_date  ON contract_alerts(alert_type, alert_date);

COMMENT ON TABLE  contract_alerts            IS 'アラート送信記録。UNIQUE制約で同日・同種の重複送信を防止。';
COMMENT ON COLUMN contract_alerts.alert_type IS 'expiry_90days=契約終了90日前 / delivery_7days=納品期日7日前 / royalty_7days=報告期限7日前 / royalty_due=報告期限当日 / royalty_overdue=報告期限超過';
