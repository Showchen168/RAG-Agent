-- ============================================================
-- Remove: 一般助理（Default Assistant）
-- Remove 一般助理 to make it an implicit system default
-- ============================================================

DELETE FROM prompt_templates WHERE name = '一般助理' AND category = 'general';
