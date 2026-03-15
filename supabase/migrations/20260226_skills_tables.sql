-- Skills System: skills + skill_attachments tables
-- Date: 2026-02-26
-- Description: 技能系統的資料庫基礎層

-- ========== skills 表 ==========
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Zap',
  category TEXT NOT NULL DEFAULT 'utility'
    CHECK (category IN ('document', 'data', 'creative', 'utility')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  skill_md TEXT NOT NULL DEFAULT '',
  skill_config JSONB NOT NULL DEFAULT '{}',
  storage_path TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- ========== skill_attachments 表 ==========
CREATE TABLE IF NOT EXISTS skill_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  preview_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== Indexes ==========
CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_user_enabled ON skills(user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_skill_attachments_message_id ON skill_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_skill_attachments_skill_id ON skill_attachments(skill_id);

-- ========== RLS Policies ==========
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_attachments ENABLE ROW LEVEL SECURITY;

-- skills: 使用者只能看到自己的技能 + 系統技能
DROP POLICY IF EXISTS "Users can view own skills and system skills" ON skills;
CREATE POLICY "Users can view own skills and system skills"
  ON skills FOR SELECT
  USING (user_id = auth.uid() OR is_system = true);

DROP POLICY IF EXISTS "Users can insert own skills" ON skills;
CREATE POLICY "Users can insert own skills"
  ON skills FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own skills" ON skills;
CREATE POLICY "Users can update own skills"
  ON skills FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own non-system skills" ON skills;
CREATE POLICY "Users can delete own non-system skills"
  ON skills FOR DELETE
  USING (user_id = auth.uid() AND is_system = false);

-- skill_attachments: 使用者只能看到自己訊息的附件
CREATE POLICY "Users can view own skill attachments"
  ON skill_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = skill_attachments.message_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own skill attachments"
  ON skill_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = skill_attachments.message_id
      AND c.user_id = auth.uid()
    )
  );

-- ========== GRANT Permissions ==========
GRANT ALL ON skills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON skills TO authenticated;
GRANT ALL ON skill_attachments TO service_role;
GRANT SELECT, INSERT ON skill_attachments TO authenticated;

-- ========== Reload PostgREST Schema Cache ==========
NOTIFY pgrst, 'reload schema';
