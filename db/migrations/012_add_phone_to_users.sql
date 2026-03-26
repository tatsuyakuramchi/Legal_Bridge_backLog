BEGIN;

ALTER TABLE lb_core.users
  ADD COLUMN IF NOT EXISTS phone varchar(50);

COMMENT ON COLUMN lb_core.users.phone IS '担当者電話番号';

INSERT INTO lb_core.schema_migrations (version, description)
VALUES ('012', 'add phone to users')
ON CONFLICT (version) DO NOTHING;

COMMIT;
