-- ============================================================
-- NexusMind Feature Expansion — Unified Migration
-- 8 features: #1 Fork, #2 Versions, #4 Canvas↔Chat,
--             #11 Auto-update, #15 Prompt Marketplace
-- ============================================================

-- #1 對話分支 (Fork)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_conversation_id uuid REFERENCES conversations(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS fork_from_message_id uuid REFERENCES messages(id);
CREATE INDEX IF NOT EXISTS idx_conversations_parent ON conversations(parent_conversation_id);

-- #2 知識庫版本歷史
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  change_description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own doc versions" ON document_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM documents WHERE documents.id = document_versions.document_id AND documents.user_id = auth.uid())
  );

-- #4 Canvas ↔ Chat 關聯
ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS source_conversation_id uuid REFERENCES conversations(id);
ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual';

-- #11 知識庫自動更新 (RSS/URL 監控)
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('rss', 'url', 'sitemap')),
  url text NOT NULL,
  name text NOT NULL,
  check_interval_hours integer DEFAULT 24,
  last_checked_at timestamptz,
  last_content_hash text,
  is_active boolean DEFAULT true,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_user ON knowledge_sources(user_id);
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sources" ON knowledge_sources
  FOR ALL USING (user_id = auth.uid());

-- #15 Prompt 模板市集
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'Sparkles',
  category text NOT NULL DEFAULT 'custom',
  system_prompt text NOT NULL,
  is_public boolean DEFAULT false,
  is_featured boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  variables jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_public ON prompt_templates(is_public, likes_count DESC);
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates" ON prompt_templates
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Anyone can read public templates" ON prompt_templates
  FOR SELECT USING (is_public = true);

CREATE TABLE IF NOT EXISTS prompt_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
ALTER TABLE prompt_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites" ON prompt_favorites
  FOR ALL USING (user_id = auth.uid());
