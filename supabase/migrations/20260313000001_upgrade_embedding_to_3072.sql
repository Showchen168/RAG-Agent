-- ============================================================
-- 升級 Embedding 維度：768 → 3072
-- 模型：gemini-embedding-001 → gemini-embedding-2-preview
-- ============================================================

-- 1. 刪除現有 HNSW 索引（無法直接 ALTER 維度）
DROP INDEX IF EXISTS idx_embeddings_vector;
DROP INDEX IF EXISTS idx_user_memories_embedding;

-- 2. 清空現有 embedding（維度不相容，必須先清空才能 ALTER）
UPDATE public.document_embeddings SET embedding = NULL;
UPDATE public.user_memories SET embedding = NULL;

-- 3. ALTER 欄位維度（使用 halfvec 突破 pgvector HNSW 2000 維上限）
ALTER TABLE public.document_embeddings
  ALTER COLUMN embedding TYPE halfvec(3072);

ALTER TABLE public.user_memories
  ALTER COLUMN embedding TYPE halfvec(3072);

-- 4. 重建 HNSW 索引
CREATE INDEX idx_embeddings_vector
  ON public.document_embeddings
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_user_memories_embedding
  ON public.user_memories
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. 重建 RPC 函式（更新參數維度）

-- match_documents: 全域向量搜尋
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding halfvec(3072),
  match_threshold float default 0.7,
  match_count int default 5,
  p_user_id uuid default auth.uid()
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM public.document_embeddings de
  JOIN public.documents d ON d.id = de.document_id
  WHERE d.user_id = coalesce(auth.uid(), p_user_id)
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- match_document_sections: 單文件向量搜尋
CREATE OR REPLACE FUNCTION public.match_document_sections(
  p_document_id uuid,
  query_embedding halfvec(3072),
  match_threshold float default 0.5,
  match_count int default 15,
  p_user_id uuid default auth.uid()
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float,
  title text,
  summary text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity,
    d.title,
    d.summary
  FROM public.document_embeddings de
  JOIN public.documents d ON d.id = de.document_id
  WHERE d.user_id = coalesce(auth.uid(), p_user_id)
    AND d.id = p_document_id
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- match_user_memories: 記憶語意搜尋
CREATE OR REPLACE FUNCTION public.match_user_memories(
  query_embedding halfvec(3072),
  match_threshold float default 0.5,
  match_count int default 5,
  p_user_id uuid default auth.uid()
)
RETURNS TABLE (
  id uuid,
  content text,
  category text,
  importance_score real,
  similarity float
)
LANGUAGE plpgsql
SET search_path = public, extensions
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
    ((1 - (um.embedding <=> query_embedding)) * 0.7 + um.importance_score * 0.3) DESC
  LIMIT match_count;
END;
$$;

-- 6. 通知 PostgREST 重新載入 schema
NOTIFY pgrst, 'reload schema';
