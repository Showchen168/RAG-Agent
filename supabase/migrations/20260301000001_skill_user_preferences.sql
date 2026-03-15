-- User Skill Preferences: per-user enable/disable for shared skills
-- Date: 2026-03-01
-- Description: 技能系統改為全域共享，每個用戶獨立控制開啟/關閉

-- ========== user_skill_preferences 表 ==========
CREATE TABLE IF NOT EXISTS user_skill_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_id)
);

-- ========== Indexes ==========
CREATE INDEX IF NOT EXISTS idx_user_skill_prefs_user_id ON user_skill_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_prefs_skill_id ON user_skill_preferences(skill_id);

-- ========== RLS Policies ==========
ALTER TABLE user_skill_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own skill preferences"
  ON user_skill_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own skill preferences"
  ON user_skill_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own skill preferences"
  ON user_skill_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- ========== 更新 skills 表 RLS：所有用戶可見所有技能 ==========
-- 先移除舊的 SELECT 政策（僅限自己的技能 + 系統技能）
DROP POLICY IF EXISTS "Users can view own skills and system skills" ON skills;

-- 新增：所有已認證用戶可看到所有技能
CREATE POLICY "Authenticated users can view all skills"
  ON skills FOR SELECT
  USING (auth.role() = 'authenticated');

-- ========== GRANT Permissions ==========
GRANT ALL ON user_skill_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE ON user_skill_preferences TO authenticated;

-- ========== Reload PostgREST Schema Cache ==========
NOTIFY pgrst, 'reload schema';
