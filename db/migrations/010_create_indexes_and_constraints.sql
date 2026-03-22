-- ============================================================
-- 010_create_indexes_and_constraints.sql
-- 追加インデックス・制約・ビュー
-- ============================================================

-- ─── 複合インデックス（よく使うクエリを高速化） ────────────

-- 契約ステータス一覧（最新50件）
CREATE INDEX IF NOT EXISTS idx_contracts_status_updated
  ON contracts(status, updated_at DESC)
  WHERE archived_at IS NULL;

-- 期限が近い契約（アラート処理用）
CREATE INDEX IF NOT EXISTS idx_contracts_end_date_active
  ON contracts(end_date)
  WHERE archived_at IS NULL AND end_date IS NOT NULL;

-- 取引先ごとの契約履歴
CREATE INDEX IF NOT EXISTS idx_contracts_partner_signed
  ON contracts(partner_id, signed_at DESC)
  WHERE partner_id IS NOT NULL;

-- 未対応の利用許諾料スケジュール
CREATE INDEX IF NOT EXISTS idx_royalty_schedules_pending
  ON royalty_schedules(fixed_due_date, direction)
  WHERE status IN ('pending', 'overdue');

-- 子課題の取得（親子課題フロー）
CREATE INDEX IF NOT EXISTS idx_contracts_parent_order
  ON contracts(parent_contract_id, child_order)
  WHERE parent_contract_id IS NOT NULL;

-- ─── よく使う検索用ビュー ───────────────────────────────

-- 契約ステータス一覧ビュー（TablePlusで頻繁に使うクエリを高速化）
CREATE OR REPLACE VIEW v_contract_status AS
  SELECT
    c.id,
    c.backlog_issue_key,
    c.contract_no,
    p.name                          AS partner_name,
    p.partner_code,
    c.contract_type,
    c.status,
    c.end_date,
    c.end_date - CURRENT_DATE       AS days_to_expiry,
    c.auto_renewal,
    c.signed_at,
    c.generation_count,
    c.updated_at
  FROM  contracts c
  LEFT  JOIN partners p ON c.partner_id = p.id
  WHERE c.archived_at IS NULL
  ORDER BY c.updated_at DESC;

-- 未対応の利用許諾料スケジュール一覧ビュー
CREATE OR REPLACE VIEW v_royalty_pending AS
  SELECT
    CASE rs.direction
      WHEN 'inbound'  THEN '📥 受取'
      WHEN 'outbound' THEN '📤 支払'
    END                             AS 方向,
    c.backlog_issue_key,
    p.name                          AS partner_name,
    rs.period_label,
    rs.fixed_due_date,
    rs.fixed_due_date - CURRENT_DATE AS days_remaining,
    rs.status
  FROM  royalty_schedules rs
  JOIN  contracts c  ON rs.contract_id = c.id
  LEFT  JOIN partners p ON c.partner_id = p.id
  WHERE rs.status IN ('pending', 'overdue')
  ORDER BY rs.fixed_due_date, rs.direction;

-- 今月の納品状況ビュー
CREATE OR REPLACE VIEW v_deliveries_this_month AS
  SELECT
    d.delivery_date,
    p.name                          AS partner_name,
    d.delivery_type,
    d.amount_ex_tax,
    d.is_final_delivery,
    c.backlog_issue_key,
    c.contract_no
  FROM  deliveries d
  JOIN  contracts  c ON d.contract_id = c.id
  LEFT  JOIN partners p ON c.partner_id = p.id
  WHERE d.delivery_date >= DATE_TRUNC('month', NOW())
  ORDER BY d.delivery_date DESC;

-- サブライセンス一覧ビュー（台帳テンプレートのデータ取得用）
CREATE OR REPLACE VIEW v_sublicenses_active AS
  SELECT
    s.*,
    c.backlog_issue_key,
    c.contract_no,
    p_partner.name AS 親contract_partner_name
  FROM  sublicenses s
  JOIN  contracts c ON s.contract_id = c.id
  LEFT  JOIN partners p_partner ON c.partner_id = p_partner.id
  WHERE s.is_active = TRUE
  ORDER BY s.contract_id, s.id;

COMMENT ON VIEW v_contract_status      IS '契約ステータス一覧（TablePlusのSaved Query推奨）';
COMMENT ON VIEW v_royalty_pending      IS '未対応の利用許諾料スケジュール（受取・支払両方）';
COMMENT ON VIEW v_deliveries_this_month IS '今月の納品状況';
COMMENT ON VIEW v_sublicenses_active   IS '有効なサブライセンス情報（台帳PDF生成時に使用）';
