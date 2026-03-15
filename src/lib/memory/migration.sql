-- ============================================================
-- NexusMind Personalized Memory System - DB Migration
-- Table: user_memories
-- Depends on: pgvector extension (already enabled)
-- ============================================================

-- user_memories 表：儲存使用者的長期記憶
CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 記憶內容
  content TEXT NOT NULL,
  embedding halfvec(3072),  -- gemini-embedding-2-preview, outputDimensionality: 3072

  -- 分類與元資料
  category TEXT NOT NULL DEFAULT 'fact'
    CHECK (category IN ('preference', 'fact', 'behavior', 'context')),
  importance_score REAL DEFAULT 0.5
    CHECK (importance_score >= 0 AND importance_score <= 1),

  -- 來源追蹤
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_type TEXT DEFAULT 'auto'
    CHECK (source_type IN ('auto', 'manual')),

  -- 狀態控制
  is_active BOOLEAN DEFAULT true,
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,

  -- 額外 metadata（彈性擴充用）
  metadata JSONB DEFAULT '{}',

  -- 時間戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引設計
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id
  ON public.user_memories(user_id);

CREATE INDEX IF NOT EXISTS idx_user_memories_category
  ON public.user_memories(user_id, category);

CREATE INDEX IF NOT EXISTS idx_user_memories_active
  ON public.user_memories(user_id, is_active)
  WHERE is_active = true;

-- HNSW 向量索引（記憶語意搜尋）
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
  ON public.user_memories
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS 策略（per-user 隔離）
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memories"
  ON public.user_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
  ON public.user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON public.user_memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON public.user_memories FOR DELETE
  USING (auth.uid() = user_id);

-- 權限
GRANT ALL ON public.user_memories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memories TO authenticated;

-- RPC: 記憶語意搜尋（考慮重要性加權）
CREATE OR REPLACE FUNCTION match_user_memories(
  query_embedding halfvec(3072),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance_score REAL,
  similarity FLOAT
)
LANGUAGE plpgsql
SET search_path = public, extensions  -- NAS pgvector schema 相容性
AS $$
BEGIN
  RETURN QUERY
  SELECT
    um.id,
    um.content,
    um.category,
    um.importance_score,
    (1 - (um.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.user_memories um
  WHERE um.user_id = p_user_id
    AND um.is_active = true
    AND 1 - (um.embedding <=> query_embedding) > match_threshold
  ORDER BY
    -- 複合排序：70% 語意相似度 + 30% 重要性
    ((1 - (um.embedding <=> query_embedding)) * 0.7 + um.importance_score * 0.3) DESC
  LIMIT match_count;
END;
$$;

-- 通知 PostgREST 重新載入 schema（NAS 環境必做）
NOTIFY pgrst, 'reload schema';
