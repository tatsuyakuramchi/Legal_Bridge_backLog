-- ============================================================
-- 013_create_license_ledger_terms.sql
-- ライセンス台帳の金銭条件
-- ============================================================

CREATE TABLE IF NOT EXISTS lb_core.license_ledger_terms (
  id                    SERIAL PRIMARY KEY,
  contract_id           INTEGER NOT NULL REFERENCES lb_core.contracts(id) ON DELETE CASCADE,
  term_order            INTEGER NOT NULL,
  heading               VARCHAR(200),
  region                VARCHAR(200),
  language              VARCHAR(200),
  region_language_label VARCHAR(200),
  base_price_label      VARCHAR(200),
  calc_method           VARCHAR(200),
  rate                  NUMERIC(10,4),
  share_rate            NUMERIC(10,4),
  calc_period           VARCHAR(200),
  mg_ag                 NUMERIC(15,2),
  payment_terms         TEXT,
  formula               TEXT,
  formula_note          TEXT,
  summary               TEXT,
  note                  TEXT,
  currency              VARCHAR(20),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_ledger_terms_contract_order
  ON lb_core.license_ledger_terms(contract_id, term_order);

CREATE INDEX IF NOT EXISTS idx_license_ledger_terms_contract
  ON lb_core.license_ledger_terms(contract_id);

CREATE INDEX IF NOT EXISTS idx_license_ledger_terms_order
  ON lb_core.license_ledger_terms(term_order);

COMMENT ON TABLE lb_core.license_ledger_terms IS 'ライセンス台帳の金銭条件を保持する明細テーブル';
