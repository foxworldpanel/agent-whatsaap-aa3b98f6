-- Ensure we have the necessary columns for session management
ALTER TABLE public.lead_finder_credentials 
ADD COLUMN IF NOT EXISTS platform text DEFAULT 'instagram',
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS profile_picture text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'never_connected',
ADD COLUMN IF NOT EXISTS storage_state_path text,
ADD COLUMN IF NOT EXISTS last_login timestamptz,
ADD COLUMN IF NOT EXISTS last_validation timestamptz,
ADD COLUMN IF NOT EXISTS last_used timestamptz;

COMMENT ON COLUMN public.lead_finder_credentials.status IS 'States: never_connected, connecting, connected, expired, disconnected, error';
