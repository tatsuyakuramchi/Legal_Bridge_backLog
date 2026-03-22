CREATE TABLE IF NOT EXISTS app_config (
  id SMALLINT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issues (
  entity_key VARCHAR(100) PRIMARY KEY,
  sort_index INTEGER NOT NULL DEFAULT 0,
  issue_key VARCHAR(50) NOT NULL,
  template_key VARCHAR(100),
  status VARCHAR(50),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  entity_key VARCHAR(100) PRIMARY KEY,
  sort_index INTEGER NOT NULL DEFAULT 0,
  event_type VARCHAR(50),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_sequences (
  entity_key VARCHAR(100) PRIMARY KEY,
  sort_index INTEGER NOT NULL DEFAULT 0,
  prefix VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_issue_key ON issues(issue_key);
CREATE INDEX IF NOT EXISTS idx_issues_template_key ON issues(template_key);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_sequences_prefix_year ON contract_sequences(prefix, year);
