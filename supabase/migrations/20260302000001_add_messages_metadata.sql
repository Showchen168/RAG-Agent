-- 為 messages 表新增 metadata JSONB 欄位
-- 用於持久化 RAG 透明度資訊等結構化 metadata，避免頁面跳轉後遺失
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN public.messages.metadata IS 'Optional structured metadata (e.g. RAG transparency info). NULL when not applicable.';

-- 通知 PostgREST 刷新 schema cache，否則新欄位會被忽略導致 INSERT 失敗
NOTIFY pgrst, 'reload schema';
