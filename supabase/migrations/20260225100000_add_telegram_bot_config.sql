-- Telegram Bot 設定表
-- 儲存管理員透過 UI 設定的 Bot Token（加密）、Webhook 資訊
-- 一個 NexusMind 實例只需一筆設定

CREATE TABLE IF NOT EXISTS telegram_bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_encrypted TEXT NOT NULL,          -- AES-256-GCM 加密後的 Token
  bot_id BIGINT,                              -- Telegram Bot 的數字 ID（getMe 回傳）
  bot_username TEXT,                          -- Bot 的 @username（getMe 回傳）
  bot_first_name TEXT,                        -- Bot 的顯示名稱（getMe 回傳）
  webhook_url TEXT,                           -- 已註冊的 Webhook URL
  webhook_secret TEXT,                        -- Webhook 驗證用的 secret token
  webhook_registered_at TIMESTAMPTZ,          -- Webhook 註冊時間
  is_active BOOLEAN DEFAULT true,             -- 此設定是否啟用
  configured_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 設定者
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE telegram_bot_config ENABLE ROW LEVEL SECURITY;

-- 認證用戶可讀取（API 層會遮罩 Token）
CREATE POLICY "Authenticated users can read bot config"
  ON telegram_bot_config FOR SELECT
  TO authenticated
  USING (true);

-- 只有 service role 可寫入（API route 用 admin client）
CREATE POLICY "Service role full access to bot config"
  ON telegram_bot_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
