-- ============================================================
-- 006_create_royalties.sql
-- 利用許諾料実績・報告スケジュール
-- ============================================================

-- 利用許諾料実績（実際に受領・支払した金額の記録）
CREATE TABLE IF NOT EXISTS royalties (
  id                SERIAL PRIMARY KEY,
  contract_id       INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  delivery_id       INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
  -- 方向
  direction         VARCHAR(10) NOT NULL,        -- inbound（当社受取）/ outbound（当社支払）
  -- 計算期間・金額
  period_label      VARCHAR(50),                 -- 例：2026Q1 / 2026年3月分
  period_start      DATE,
  period_end        DATE,
  royalty_type      VARCHAR(20) NOT NULL,        -- fixed_rate / tiered_rate / quantity_based / revenue_share / minimum_guarantee
  sales_amount      NUMERIC(15,2),               -- 売上基準額
  royalty_rate      NUMERIC(5,2),                -- 料率（%）
  calculated_amount NUMERIC(15,2),               -- 計算金額（税抜）
  minimum_guarantee NUMERIC(15,2),               -- 最低保証額
  final_amount      NUMERIC(15,2) NOT NULL,      -- 最終支払金額（税抜）
  currency          VARCHAR(10) NOT NULL DEFAULT 'JPY',
  -- 報告
  reported_at       TIMESTAMPTZ,                 -- 相手方から報告を受けた日時（inbound）
  paid_at           TIMESTAMPTZ,                 -- 支払完了日時（outbound）
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 利用許諾料報告スケジュール（期限管理）
CREATE TABLE IF NOT EXISTS royalty_schedules (
  id                     SERIAL PRIMARY KEY,
  contract_id            INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  -- 方向（重要）
  direction              VARCHAR(10) NOT NULL,   -- inbound（相手方からの報告待ち）/ outbound（当社が払う側）
  -- スケジュール設定
  schedule_type          VARCHAR(20) NOT NULL,   -- cycle（定期）/ fixed（固定期日）
  cycle                  VARCHAR(20),            -- monthly / quarterly / annually（schedule_type=cycleの場合）
  report_due_day         INTEGER,                -- 報告期限日（例：31=月末）
  fixed_due_date         DATE,                   -- 具体的な期日（schedule_type=fixedの場合）
  period_label           VARCHAR(50),            -- 対象期間ラベル（例：2026Q1）
  -- ステータス
  -- inbound: pending（未受領）/ received（受領済）/ overdue（超過）
  -- outbound: pending（未払）/ paid（支払済）/ overdue（超過）
  status                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  received_at            TIMESTAMPTZ,            -- 受領日時（inbound）
  paid_at                TIMESTAMPTZ,            -- 支払完了日時（outbound）
  -- アラート送信記録（重複防止）
  alert_7days_sent_at    TIMESTAMPTZ,
  alert_due_sent_at      TIMESTAMPTZ,
  alert_overdue_sent_at  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_royalties_contract        ON royalties(contract_id);
CREATE INDEX IF NOT EXISTS idx_royalties_direction       ON royalties(direction);
CREATE INDEX IF NOT EXISTS idx_royalty_schedules_contract ON royalty_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_royalty_schedules_status  ON royalty_schedules(status);
CREATE INDEX IF NOT EXISTS idx_royalty_schedules_due     ON royalty_schedules(fixed_due_date);
CREATE INDEX IF NOT EXISTS idx_royalty_schedules_direction ON royalty_schedules(direction);

COMMENT ON TABLE  royalties                     IS '利用許諾料実績。受領・支払ごとに1レコード。';
COMMENT ON COLUMN royalties.direction           IS 'inbound=当社受取（ライセンサーとして）/ outbound=当社支払（ライセンシーとして）';
COMMENT ON TABLE  royalty_schedules             IS '利用許諾料の期限スケジュール管理。アラート送信の基準テーブル。';
COMMENT ON COLUMN royalty_schedules.direction   IS 'inbound: 相手方の報告を待つ側。outbound: 当社が報告・支払いを行う側。';
COMMENT ON COLUMN royalty_schedules.status      IS 'inbound: pending/received/overdue。outbound: pending/paid/overdue。';
