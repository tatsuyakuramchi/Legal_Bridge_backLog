-- ============================================================
-- 007_create_sublicenses.sql
-- サブライセンス情報（再許諾先管理）
-- ============================================================

CREATE TABLE IF NOT EXISTS sublicenses (
  id                 SERIAL PRIMARY KEY,
  contract_id        INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  -- サブライセンス先
  区分               VARCHAR(50) NOT NULL,        -- パブリッシャー再許諾 / OEM委託者再許諾 / その他
  相手先名           VARCHAR(200) NOT NULL,
  相手先コード       VARCHAR(50),                  -- partnersテーブルのpartner_code（任意）
  相手先_partner_id  INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  -- 条件
  地域               VARCHAR(100),                -- 例：日本・北米・欧州
  言語               VARCHAR(100),                -- 例：日本語・英語
  適用金銭条件       VARCHAR(100),                -- 例：金銭条件2
  MG_AG              NUMERIC(15,2),               -- ミニマムギャランティ / アドバンス金額
  個別料率           NUMERIC(5,2),                -- 個別料率（%）
  契約締結日         DATE,
  備考               TEXT,
  -- 管理
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,  -- false=論理削除
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sublicenses_contract    ON sublicenses(contract_id);
CREATE INDEX IF NOT EXISTS idx_sublicenses_partner     ON sublicenses(相手先_partner_id);
CREATE INDEX IF NOT EXISTS idx_sublicenses_active      ON sublicenses(is_active);

COMMENT ON TABLE  sublicenses             IS 'サブライセンス情報。台帳テンプレートの{{#each sublicenses}}セクションに動的に展開される。';
COMMENT ON COLUMN sublicenses.is_active   IS 'falseで論理削除。台帳再生成時はis_active=trueのみ取得する。';
COMMENT ON COLUMN sublicenses.相手先コード IS 'partnersテーブルのpartner_codeと一致する場合、相手先_partner_idも自動セット。';
