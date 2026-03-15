-- Fix SECURITY DEFINER spoofing vulnerability in vector search RPCs
-- By forcing the use of auth.uid() when invoked by authenticated clients,
-- we prevent malicious REST API callers from passing another user's UUID.
-- Service Role keys (which have no auth.uid()) will fall back to using p_user_id.

create or replace function public.match_documents(
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
set search_path = public
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
  where d.user_id = coalesce(auth.uid(), p_user_id)
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;

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
  where d.user_id = coalesce(auth.uid(), p_user_id)
    and d.id = p_document_id
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
