-- Fix match_document_sections: vector(1536) → vector(768) to match actual embeddings
-- Also add title and summary to return table (align with match_documents)

-- Drop both possible signatures to prevent stale overloads
drop function if exists match_document_sections(uuid, vector(1536), float, int, uuid);
drop function if exists match_document_sections(uuid, vector(768), float, int, uuid);

create or replace function public.match_document_sections(
  p_document_id uuid,
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 15,
  p_user_id uuid default auth.uid()
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
security definer
set search_path = public
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
    and d.id = p_document_id
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
