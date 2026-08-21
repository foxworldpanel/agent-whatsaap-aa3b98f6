DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'lead_finder_provider_runs'
    AND con.contype = 'f'
    AND con.conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'credential_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE lead_finder_provider_runs DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE lead_finder_provider_runs
  ADD CONSTRAINT lead_finder_provider_runs_credential_id_fkey
  FOREIGN KEY (credential_id)
  REFERENCES lead_finder_credentials(id)
  ON DELETE SET NULL;
END $$;

SELECT con.conname AS constraint_name, con.confdeltype AS delete_action
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'lead_finder_provider_runs' AND con.contype = 'f';