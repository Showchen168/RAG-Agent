-- Add BM25 full-text search capability to document_embeddings

ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS chunk_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(chunk_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_document_embeddings_tsv
  ON document_embeddings USING GIN (chunk_tsv);

CREATE OR REPLACE FUNCTION match_documents_bm25(
  query_text text,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  document_id uuid,
  chunk_text text,
  similarity float,
  chunk_index int,
  metadata jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    de.document_id,
    de.chunk_text,
    ts_rank(de.chunk_tsv, plainto_tsquery('simple', query_text)) AS similarity,
    de.chunk_index,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  WHERE d.user_id = p_user_id
    AND d.enabled = true
    AND de.chunk_tsv @@ plainto_tsquery('simple', query_text)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
