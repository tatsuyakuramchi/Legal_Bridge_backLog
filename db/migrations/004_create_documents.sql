-- ============================================================
-- 004_create_documents.sql
-- 生成文書台帳（生成されたPDFの履歴管理）
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id              SERIAL PRIMARY KEY,
  contract_id     INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  document_type   VARCHAR(50) NOT NULL,     -- draft / review / send / final / payment / fixed
  file_name       VARCHAR(300) NOT NULL,    -- 例：C_LGL_202603_0003_draft_20260401.pdf
  drive_url       TEXT NOT NULL,            -- Google Drive共有リンク
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by    VARCHAR(50),              -- 'system'（自動）または Slack User ID（手動再生成）
  template_ids    TEXT[],                   -- 使用したテンプレートファイル名の配列
  is_merged       BOOLEAN NOT NULL DEFAULT FALSE,  -- 合冊PDFフラグ（親子課題）
  child_count     INTEGER,                  -- 合冊した文書数（is_merged=trueの場合）
  notes           TEXT                      -- 備考（修正理由等）
);

CREATE INDEX IF NOT EXISTS idx_documents_contract_id  ON documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_type         ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_generated_at ON documents(generated_at DESC);

COMMENT ON TABLE  documents               IS '生成文書台帳。契約ごとの全PDF生成履歴を記録。';
COMMENT ON COLUMN documents.document_type IS 'draft=草案 / review=社内レビュー / send=相手方確認 / final=締結済 / payment=支払通知書 / fixed=相手方修正対応版';
COMMENT ON COLUMN documents.file_name     IS '命名規則: {CONTRACT_NO}_{type}_{YYYYMMDD}.pdf / Fixed版: {CONTRACT_NO}_Fixed{YYYYMMDD}.pdf';
