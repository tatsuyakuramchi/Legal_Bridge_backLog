-- ============================================================
-- 003_create_contracts.sql
-- 契約マスタ（システムの中心テーブル）
-- ============================================================

CREATE TABLE IF NOT EXISTS contracts (
  id                        SERIAL PRIMARY KEY,

  -- Backlog連携
  backlog_issue_id          INTEGER UNIQUE NOT NULL,          -- Backlog課題ID
  backlog_issue_key         VARCHAR(20) NOT NULL,             -- 課題キー（例：LEGAL-42）
  backlog_project_id        INTEGER,                          -- BacklogプロジェクトID

  -- 契約書番号（自動採番）
  -- フォーマット: C_LGL_YYYYMM_NNNN / PO_LGL_YYYYMM_NNNN / LIC_LGL_YYYYMM_NNNN
  contract_no               VARCHAR(30) UNIQUE NOT NULL,

  -- 親子課題（複数附属書類生成）
  parent_contract_id        INTEGER REFERENCES contracts(id) ON DELETE SET NULL,  -- 親契約FK（子課題のみ設定）
  child_order               INTEGER,                          -- 親契約内での合冊順番（1から連番）
  is_parent                 BOOLEAN NOT NULL DEFAULT FALSE,   -- 子課題を持つ親課題フラグ
  child_count               INTEGER NOT NULL DEFAULT 0,       -- 子課題数のキャッシュ

  -- 取引先
  partner_id                INTEGER REFERENCES partners(id) ON DELETE RESTRICT,
  counterparty              VARCHAR(200) NOT NULL DEFAULT '', -- 相手方名（partner_idがある場合は自動補完）
  counterparty_person       VARCHAR(100),                     -- 相手方担当者名

  -- 契約種別・ステータス
  contract_type             VARCHAR(50) NOT NULL,             -- ライセンス契約/売買契約/業務委託/発注書/NDA等
  status                    VARCHAR(50) NOT NULL DEFAULT '草案',
  status_id                 INTEGER,                          -- Backlogステータスのnum_id

  -- 契約期間
  start_date                DATE,
  end_date                  DATE,
  auto_renewal              BOOLEAN NOT NULL DEFAULT FALSE,   -- 自動更新フラグ

  -- 文書バージョン管理
  generation_count          INTEGER NOT NULL DEFAULT 0,       -- Fixed版の再生成回数
  last_fixed_at             TIMESTAMPTZ,                      -- 最後にFixed版を生成した日時
  last_fixed_drive_url      TEXT,                             -- 最新Fixed版PDFのDrive URL

  -- カスタムドラフト
  custom_draft_type         VARCHAR(50),                      -- counterparty_revision / scratch / amendment / memorandum / template_modification
  custom_draft_drive_url    TEXT,                             -- カスタムドラフトのDrive URL
  custom_draft_base_drive_url TEXT,                           -- 相手方ひな型のDrive URL
  custom_draft_sent_at      TIMESTAMPTZ,                      -- 事業部送付日時

  -- 押印・締結
  signing_method            VARCHAR(20),                      -- physical（物理押印）/ electronic（電子署名）
  counterparty_ok_at        TIMESTAMPTZ,                      -- 相手方OK日時
  esign_completed_at        TIMESTAMPTZ,                      -- 電子署名完了日時
  signed_at                 TIMESTAMPTZ,                      -- 締結日時

  -- Drive
  drive_folder_url          TEXT,                             -- Google DriveフォルダーURL（システム自動セット）

  -- 外部文書登録
  document_origin           VARCHAR(20) DEFAULT 'internal',  -- internal / external
  external_doc_drive_url    TEXT,
  external_doc_received_at  DATE,
  is_approver_self          BOOLEAN DEFAULT FALSE,            -- 法務担当者が承認者を兼任

  -- アーカイブ・キャンセル
  archived_at               TIMESTAMPTZ,
  canceled_at               TIMESTAMPTZ,

  -- 一括発注書（CSV生成）
  bulk_job_id               UUID,                             -- 一括処理ジョブのID（同一CSVから生成されたレコードで共通）
  bulk_row_number           INTEGER,                          -- CSV内の行番号

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_contracts_issue_id        ON contracts(backlog_issue_id);
CREATE INDEX IF NOT EXISTS idx_contracts_issue_key       ON contracts(backlog_issue_key);
CREATE INDEX IF NOT EXISTS idx_contracts_contract_no     ON contracts(contract_no);
CREATE INDEX IF NOT EXISTS idx_contracts_partner_id      ON contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status          ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_type            ON contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date        ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_parent_id       ON contracts(parent_contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_archived        ON contracts(archived_at) WHERE archived_at IS NULL;

COMMENT ON TABLE  contracts                    IS '契約マスタ。Backlog課題と1:1対応。全フローの中心テーブル。';
COMMENT ON COLUMN contracts.contract_no        IS '自動採番。C_LGL_202603_0001（契約）/ PO_LGL_202603_0001（発注書）/ LIC_LGL_202603_0001（個別許諾）';
COMMENT ON COLUMN contracts.parent_contract_id IS '親子課題方式（複数附属書類）の場合に設定。NULLなら独立した契約。';
COMMENT ON COLUMN contracts.child_order        IS '合冊時の順番。親=NULL、子1=1、子2=2...';
COMMENT ON COLUMN contracts.generation_count   IS 'Fixed版生成のたびにインクリメント。0=まだFixed版なし。';
