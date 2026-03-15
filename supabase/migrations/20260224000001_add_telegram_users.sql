-- Telegram Bot 用戶映射表
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  default_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 快速查找 telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id ON telegram_users(telegram_chat_id);

-- RLS
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Service role 可完全存取（webhook route 使用 admin client）
CREATE POLICY "Service role full access on telegram_users"
  ON telegram_users
  FOR ALL
  USING (true)
  WITH CHECK (true);
