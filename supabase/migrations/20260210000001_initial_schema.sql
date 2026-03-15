-- NexusMind Initial Schema
-- 啟用必要擴展
create extension if not exists "vector";

-- ============================================
-- profiles（使用者擴展資訊）
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  preferred_model text default 'claude' check (preferred_model in ('claude', 'gpt')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 新使用者自動建立 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- documents（知識庫文件）
-- ============================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  content text not null,
  summary text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_documents_user_id on public.documents(user_id);

-- ============================================
-- document_embeddings（向量搜尋）
-- ============================================
create table public.document_embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents on delete cascade not null,
  chunk_text text not null,
  embedding vector(1536),
  chunk_index int not null,
  created_at timestamptz default now()
);

create index idx_embeddings_document_id on public.document_embeddings(document_id);

-- HNSW 索引加速向量搜尋
create index idx_embeddings_vector on public.document_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ============================================
-- conversations（對話紀錄）
-- ============================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text default '新對話',
  model text default 'claude' check (model in ('claude', 'gpt')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_conversations_user_id on public.conversations(user_id);

-- ============================================
-- messages（訊息紀錄）
-- ============================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

create index idx_messages_conversation_id on public.messages(conversation_id);

-- ============================================
-- RLS 政策
-- ============================================
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- profiles: 使用者只能存取自己的 profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- documents: 使用者只能存取自己的文件
create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- document_embeddings: 透過 documents 的關聯控制
create policy "Users can view own embeddings"
  on public.document_embeddings for select
  using (
    exists (
      select 1 from public.documents
      where documents.id = document_embeddings.document_id
        and documents.user_id = auth.uid()
    )
  );

create policy "Users can insert own embeddings"
  on public.document_embeddings for insert
  with check (
    exists (
      select 1 from public.documents
      where documents.id = document_embeddings.document_id
        and documents.user_id = auth.uid()
    )
  );

create policy "Users can delete own embeddings"
  on public.document_embeddings for delete
  using (
    exists (
      select 1 from public.documents
      where documents.id = document_embeddings.document_id
        and documents.user_id = auth.uid()
    )
  );

-- conversations: 使用者只能存取自己的對話
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- messages: 透過 conversations 的關聯控制
create policy "Users can view own messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert own messages"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

-- ============================================
-- 語意搜尋函式
-- ============================================
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
