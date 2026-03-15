-- Google Drive 連接狀態追蹤
-- 追蹤哪位使用者連接了 Google Drive
-- 當不同使用者存取時，自動斷開舊連接並引導新使用者授權

CREATE TABLE IF NOT EXISTS gdrive_connection_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- 單行限制
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gdrive_connection_state ENABLE ROW LEVEL SECURITY;

-- Service role 完整存取（API routes 使用 admin client）
CREATE POLICY "Service role full access on gdrive_connection_state"
  ON gdrive_connection_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 認證使用者可讀取（檢查誰連接了）
CREATE POLICY "Authenticated can read gdrive_connection_state"
  ON gdrive_connection_state
  FOR SELECT
  TO authenticated
  USING (true);

-- 權限
GRANT ALL ON gdrive_connection_state TO service_role;
GRANT SELECT ON gdrive_connection_state TO authenticated;
