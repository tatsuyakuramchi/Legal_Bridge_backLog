-- ============================================================
-- 005_create_deliveries.sql
-- 納品管理・納品明細
-- ============================================================

CREATE TABLE IF NOT EXISTS deliveries (
  id                  SERIAL PRIMARY KEY,
  contract_id         INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  backlog_issue_id    INTEGER UNIQUE,          -- 納品リクエスト課題ID（LEGAL-55等）
  backlog_issue_key   VARCHAR(20),
  delivery_type       VARCHAR(30) NOT NULL,    -- 検収 / 利用許諾料 / レベニューシェア
  delivery_date       DATE,                    -- 納品・検収日
  amount_ex_tax       NUMERIC(15,2),           -- 税抜金額
  tax_rate            NUMERIC(5,2) NOT NULL DEFAULT 10.00, -- 消費税率（%）
  withholding_tax     NUMERIC(15,2),           -- 源泉徴収税額（個人の場合）
  payment_due_date    DATE,                    -- 支払期日
  -- 分割納品
  partial_number      INTEGER,                 -- 分割回数（1回目=1, 2回目=2...）
  total_partials      INTEGER,                 -- 分割総数
  is_final_delivery   BOOLEAN NOT NULL DEFAULT FALSE,  -- 最終納品フラグ
  -- Drive・書類
  drive_url           TEXT,                    -- 納品物のDrive URL
  inspection_doc_url  TEXT,                    -- 検収書のDrive URL
  payment_notice_url  TEXT,                    -- 支払通知書のDrive URL
  -- 承認者情報
  approver_name       VARCHAR(100),
  approver_department VARCHAR(100),
  reviewer_name       VARCHAR(100),
  reviewer_department VARCHAR(100),
  person_name         VARCHAR(100),
  person_department   VARCHAR(100),
  approval_comments   TEXT,
  approved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 納品明細（複数成果物の場合）
CREATE TABLE IF NOT EXISTS delivery_items (
  id               SERIAL PRIMARY KEY,
  delivery_id      INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  item_order       INTEGER NOT NULL DEFAULT 1,   -- 表示順
  name             VARCHAR(300) NOT NULL,         -- 成果物名
  spec             TEXT,                          -- 仕様・詳細
  item_no          VARCHAR(50),                   -- 品番・管理番号
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price       NUMERIC(15,2),
  amount           NUMERIC(15,2),
  -- 状態
  is_completed     BOOLEAN NOT NULL DEFAULT TRUE, -- 完了フラグ
  this_time_qty    INTEGER,                       -- 今回納品数
  total_qty        INTEGER,                       -- 総納品予定数
  -- 修正・金額変更
  has_revision     BOOLEAN NOT NULL DEFAULT FALSE,
  revision_detail  TEXT,
  has_amount_change  BOOLEAN NOT NULL DEFAULT FALSE,
  original_amount  NUMERIC(15,2),
  new_amount       NUMERIC(15,2),
  amount_change_reason TEXT,
  -- マイルストーン
  milestone_name   VARCHAR(200),
  completion_date  DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_contract_id    ON deliveries(contract_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_issue_id       ON deliveries(backlog_issue_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_payment_due    ON deliveries(payment_due_date);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery   ON delivery_items(delivery_id);

COMMENT ON TABLE  deliveries               IS '納品管理。納品リクエスト課題ごとに1レコード。';
COMMENT ON COLUMN deliveries.delivery_type IS '検収（業務委託成果物）/ 利用許諾料（ロイヤリティ）/ レベニューシェア';
COMMENT ON TABLE  delivery_items           IS '納品明細。複数成果物がある場合にdeliveriesと1:N。';
