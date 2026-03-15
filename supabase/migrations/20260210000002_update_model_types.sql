-- 更新 model 選項從 claude/gpt 改為 gemini-pro/gemini-flash
alter table public.profiles drop constraint if exists profiles_preferred_model_check;
alter table public.profiles add constraint profiles_preferred_model_check
  check (preferred_model in ('gemini-pro', 'gemini-flash'));
alter table public.profiles alter column preferred_model set default 'gemini-pro';

alter table public.conversations drop constraint if exists conversations_model_check;
alter table public.conversations add constraint conversations_model_check
  check (model in ('gemini-pro', 'gemini-flash'));
alter table public.conversations alter column model set default 'gemini-pro';
