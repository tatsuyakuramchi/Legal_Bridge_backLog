-- ============================================================
-- 002_create_partners.sql
-- 取引先マスタ（管理WebUI・CSVインポートで管理）
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  id                           SERIAL PRIMARY KEY,
  partner_code                 VARCHAR(50) UNIQUE NOT NULL,   -- 取引先コード（例：GK-001）経理・事業部共通
  name                         VARCHAR(200) NOT NULL,         -- 取引先名称（正式名称）
  is_corporation               BOOLEAN NOT NULL DEFAULT TRUE, -- true=法人 / false=個人
  representative               VARCHAR(200),                  -- 代表者名（法人の場合：代表取締役 ○○ ○○）
  contact_person               VARCHAR(100),                  -- 担当者名
  contact_email                VARCHAR(200),                  -- 担当者メールアドレス
  contact_phone                VARCHAR(50),                   -- 担当者電話番号
  address                      TEXT,                          -- 住所
  is_invoice_issuer            BOOLEAN NOT NULL DEFAULT FALSE,-- インボイス発行事業者フラグ
  invoice_registration_number  VARCHAR(20),                   -- インボイス登録番号（例：T1234567890123）
  -- 銀行口座情報
  bank_name                    VARCHAR(100),                  -- 銀行名
  bank_branch                  VARCHAR(100),                  -- 支店名
  bank_account_type            VARCHAR(20),                   -- 口座種別（普通/当座）
  bank_account_number          VARCHAR(20),                   -- 口座番号
  bank_account_holder          VARCHAR(200),                  -- 口座名義（カナ）
  -- 管理
  is_active                    BOOLEAN NOT NULL DEFAULT TRUE, -- 有効フラグ（falseで論理削除）
  notes                        TEXT,                          -- 備考
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_code        ON partners(partner_code);
CREATE INDEX IF NOT EXISTS idx_partners_name        ON partners(name);
CREATE INDEX IF NOT EXISTS idx_partners_is_active   ON partners(is_active);
CREATE INDEX IF NOT EXISTS idx_partners_corporation ON partners(is_corporation);

COMMENT ON TABLE  partners                          IS '取引先マスタ。is_corporationで文書の法人/個人表記・敬称・源泉徴収処理を自動制御。';
COMMENT ON COLUMN partners.is_corporation           IS 'true=法人（御中・代表者名表示）, false=個人（様・代表者名非表示・源泉徴収対象）';
COMMENT ON COLUMN partners.partner_code             IS '経理部・事業部共通コード。Slackフォームで入力するとDBから相手方情報を自動補完。';
