-- 新增 enabled 欄位：控制文件是否參與 RAG 引用（預設啟用）
alter table public.documents add column if not exists enabled boolean default true not null;
