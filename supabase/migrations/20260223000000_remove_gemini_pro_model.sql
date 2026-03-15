-- 移除 gemini-pro 模型選項，統一使用 gemini-flash
-- 1. 將現有 gemini-pro 資料遷移為 gemini-flash
update public.profiles set preferred_model = 'gemini-flash' where preferred_model = 'gemini-pro';
update public.conversations set model = 'gemini-flash' where model = 'gemini-pro';

-- 2. 更新 check constraint 只允許 gemini-flash
alter table public.profiles drop constraint if exists profiles_preferred_model_check;
alter table public.profiles add constraint profiles_preferred_model_check
  check (preferred_model in ('gemini-flash'));
alter table public.profiles alter column preferred_model set default 'gemini-flash';

alter table public.conversations drop constraint if exists conversations_model_check;
alter table public.conversations add constraint conversations_model_check
  check (model in ('gemini-flash'));
alter table public.conversations alter column model set default 'gemini-flash';
