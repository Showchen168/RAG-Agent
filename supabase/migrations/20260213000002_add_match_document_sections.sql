-- Add match_document_sections function for single-document RAG
-- Parameters:
--   p_document_id: The UUID of the specific document to search within
--   query_embedding: The vector embedding of the user's query
--   match_threshold: Minimum similarity score (0-1)
--   match_count: Maximum number of chunks to return
--   p_user_id: The UUID of the user (defaults to auth.uid())

create or replace function public.match_document_sections(
  p_document_id uuid,
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5,
  p_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float
)
language plpgsql
security definer
as $$
begin
  return query
  select
    de.id,
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  where d.user_id = p_user_id
    and d.id = p_document_id
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
