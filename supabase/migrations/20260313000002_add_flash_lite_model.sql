-- 新增 gemini-flash-lite 模型選項
-- 同時恢復 gemini-pro（用於 Skills Pipeline Phase 0 等場景）

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_model_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_model_check
  CHECK (preferred_model = ANY (ARRAY['gemini-pro'::text, 'gemini-flash'::text, 'gemini-flash-lite'::text]));

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_model_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_model_check
  CHECK (model = ANY (ARRAY['gemini-pro'::text, 'gemini-flash'::text, 'gemini-flash-lite'::text]));

NOTIFY pgrst, 'reload schema';
