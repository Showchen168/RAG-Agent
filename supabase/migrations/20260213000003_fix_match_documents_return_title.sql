-- Fix match_documents to return document title and summary for @mention feature
-- The previous version only returned embedding fields, making it impossible
-- to display document titles in the mention suggestion list

-- 1. Drop old function signature
drop function if exists match_documents(vector(768), float, int, uuid);

-- 2. Recreate with title and summary in return type
create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float,
  title text,
  summary text
)
language plpgsql
as $$
begin
  return query
  select
    de.id,
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) as similarity,
    d.title,
    d.summary
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  where d.user_id = p_user_id
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
