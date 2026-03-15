-- Phase A.1: Google Drive User Tokens Table
-- Replaces old Rube gdrive_connection_state with per-user OAuth tokens

-- Drop old table
DROP TABLE IF EXISTS public.gdrive_connection_state;

-- Create new google drive user tokens table
CREATE TABLE public.gdrive_user_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,      -- Encrypted AES-256-GCM
  refresh_token TEXT NOT NULL,     -- Encrypted AES-256-GCM
  token_expiry TIMESTAMPTZ NOT NULL,
  email TEXT,                       -- Google account email
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.gdrive_user_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read/write their own tokens
CREATE POLICY "users_self_access" ON public.gdrive_user_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Service role (admin) can access all
CREATE POLICY "service_role_admin" ON public.gdrive_user_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX idx_gdrive_user_tokens_user_id ON public.gdrive_user_tokens(user_id);

-- Set up trigger for updated_at
CREATE OR REPLACE FUNCTION update_gdrive_user_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gdrive_user_tokens_updated_at
  BEFORE UPDATE ON public.gdrive_user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_gdrive_user_tokens_updated_at();

