-- 新增自訂系統提示詞欄位
alter table public.profiles
  add column if not exists system_prompt text default '';
