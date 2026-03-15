-- Telegram 帳號綁定碼表
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by_chat_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 快速查找綁定碼
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code);

-- 快速查找用戶的綁定碼
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id ON telegram_link_codes(user_id);

-- RLS
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- 用戶只能看到自己的綁定碼
CREATE POLICY "Users can view own link codes"
  ON telegram_link_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- 用戶只能新增自己的綁定碼
CREATE POLICY "Users can insert own link codes"
  ON telegram_link_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role 可完全存取（webhook 用 admin client 驗證綁定碼）
CREATE POLICY "Service role full access on telegram_link_codes"
  ON telegram_link_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 為 telegram_users 表新增 RLS 政策，讓用戶可以查看自己的綁定狀態
CREATE POLICY "Users can view own telegram binding"
  ON telegram_users
  FOR SELECT
  USING (auth.uid() = user_id);
