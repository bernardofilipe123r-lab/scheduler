-- Add updated_at column to generation_jobs for stuck job detection.
-- Auto-set on every UPDATE via trigger.

ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Initialize updated_at from created_at for existing rows
UPDATE generation_jobs SET updated_at = COALESCE(completed_at, started_at, created_at)
WHERE updated_at = (SELECT column_default::timestamptz FROM information_schema.columns
  WHERE table_name = 'generation_jobs' AND column_name = 'updated_at' LIMIT 1)
  OR updated_at IS NULL;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON generation_jobs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'generation_jobs' AND column_name = 'updated_at';
