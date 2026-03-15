-- Fix embedding dimension: OpenAI ada-002 uses 1536, Google text-embedding-004 uses 768
-- This migration updates the vector dimension to match the Google embedding model

-- 1. Drop existing HNSW index
drop index if exists idx_embeddings_vector;

-- 2. Delete any existing embeddings (they were 1536-dim, incompatible with 768)
delete from public.document_embeddings;

-- 3. Alter column type to vector(768)
alter table public.document_embeddings
  alter column embedding type vector(768);

-- 4. Recreate HNSW index for 768-dim vectors
create index idx_embeddings_vector on public.document_embeddings
  using hnsw (embedding vector_cosine_ops);

-- 5. Drop old function (cannot change param types with create or replace)
drop function if exists match_documents(vector(1536), float, int, uuid);

-- 6. Recreate match_documents function with corrected vector dimension
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
  similarity float
)
language plpgsql
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
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
