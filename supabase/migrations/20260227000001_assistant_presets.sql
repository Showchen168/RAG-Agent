-- Assistant Presets System
-- Date: 2026-02-27
-- Description: 助手預設系統 — 資料表、種子資料、RLS、權限

-- ========== assistant_presets 表 ==========
CREATE TABLE IF NOT EXISTS assistant_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  avatar TEXT NOT NULL,
  description TEXT,
  description_en TEXT,
  system_prompt TEXT,
  enabled_skill_ids UUID[] DEFAULT '{}',
  rules JSONB DEFAULT '[]',
  quick_prompts JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== Indexes ==========
CREATE INDEX IF NOT EXISTS idx_assistant_presets_enabled ON assistant_presets(is_enabled, sort_order);

-- ========== RLS Policies ==========
ALTER TABLE assistant_presets ENABLE ROW LEVEL SECURITY;

-- 所有已認證使用者可讀取啟用的預設
CREATE POLICY "Authenticated users can view enabled presets"
  ON assistant_presets FOR SELECT
  TO authenticated
  USING (is_enabled = true);

-- ========== GRANT Permissions ==========
GRANT ALL ON assistant_presets TO service_role;
GRANT SELECT ON assistant_presets TO authenticated;

-- ========== conversations.extra 擴展 ==========
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';

-- ========== Seed Data ==========
INSERT INTO assistant_presets (name, name_en, avatar, description, description_en, system_prompt, quick_prompts, sort_order, is_default, is_enabled) VALUES
(
  '一般助手',
  'General Assistant',
  '🤖',
  '通用 AI 助手，適合日常問答與各種任務',
  'General-purpose AI assistant for everyday Q&A and tasks',
  NULL,
  '["幫我整理這段文字的重點", "用簡單的方式解釋這個概念", "幫我列出優缺點比較"]'::jsonb,
  0,
  true,
  true
),
(
  '寫作助手',
  'Writing Assistant',
  '✍️',
  '專精文案撰寫、翻譯潤稿與創意寫作',
  'Specializes in copywriting, translation, and creative writing',
  '你是一位專業的寫作助手。擅長文案撰寫、翻譯潤稿、創意寫作。回答時注重文字的流暢度、結構性和表達力。在修改文章時，會說明修改理由。',
  '["幫我潤飾這段文章", "將這段翻譯成英文", "幫我寫一封正式的商業信件"]'::jsonb,
  1,
  false,
  true
),
(
  '程式助手',
  'Code Assistant',
  '💻',
  '程式碼撰寫、除錯、架構設計與技術諮詢',
  'Code writing, debugging, architecture design, and tech consulting',
  '你是一位資深的軟體工程師助手。擅長程式碼撰寫、除錯、架構設計。回答時提供可執行的程式碼範例，說明設計決策的理由，並注意效能與安全性。使用 TypeScript/JavaScript 為主要語言。',
  '["幫我 review 這段程式碼", "這個 bug 可能的原因是什麼？", "幫我設計這個功能的資料結構"]'::jsonb,
  2,
  false,
  true
),
(
  '分析助手',
  'Analysis Assistant',
  '📊',
  '資料分析、報告撰寫與商業策略建議',
  'Data analysis, report writing, and business strategy',
  '你是一位資料分析師助手。擅長資料分析、趨勢解讀、報告撰寫。回答時使用數據支持論點，提供結構化的分析框架，善用表格和圖表建議來呈現複雜資訊。',
  '["分析這組資料的趨勢", "幫我寫一份分析報告的大綱", "這個商業決策的 SWOT 分析"]'::jsonb,
  3,
  false,
  true
),
(
  '創意助手',
  'Creative Assistant',
  '🎨',
  '腦力激盪、創意發想與內容企劃',
  'Brainstorming, creative ideation, and content planning',
  '你是一位創意總監助手。擅長腦力激盪、創意發想、內容企劃。回答時提供多元角度的創意方案，善用類比和故事來啟發靈感，鼓勵跳脫框架思考。',
  '["幫我想 5 個行銷標語", "這個主題有哪些創意切角？", "幫我規劃社群媒體內容日曆"]'::jsonb,
  4,
  false,
  true
);

-- ========== Reload PostgREST Schema Cache ==========
NOTIFY pgrst, 'reload schema';
