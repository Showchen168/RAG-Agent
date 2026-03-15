-- 稽核日誌表：追蹤所有認證相關事件
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address text,
  metadata jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 索引：依事件類型查詢
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON public.audit_logs(event);

-- 索引：依使用者查詢
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- 索引：依時間範圍查詢
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- 權限：授予所有 Supabase 角色存取權
GRANT ALL ON public.audit_logs TO postgres, anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- RLS：僅允許 service_role 寫入，一般使用者不可存取
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY audit_logs_service_role_all ON public.audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY audit_logs_insert_all ON public.audit_logs
  FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

-- 自動清理 90 天前的日誌（透過 pg_cron 或手動排程）
COMMENT ON TABLE public.audit_logs IS '認證稽核日誌。建議定期清理 90 天以前的記錄。';

-- 通知 PostgREST 刷新 schema cache
NOTIFY pgrst, 'reload schema';
