# Assistant Preset System — 設計文件

> 日期：2026-02-27
> 參考：AionUi (github.com/iOfficeAI/AionUi)
> 狀態：已核准

## 目標

在 NexusMind 對話介面實現類似 AionUi 的助手預設系統，讓使用者在歡迎畫面選擇不同助手（如寫作助手、程式助手），每個助手帶有專屬技能、規則和快捷提示。

## 決策記錄

| 問題 | 決策 | 理由 |
|------|------|------|
| 多模型切換 | 不做，專注助手預設 | 目前只有 gemini-flash，未來再擴展 |
| 與 Persona 系統關係 | 獨立新建表，並存 | 避免破壞現有功能，職責分離 |
| 資料來源 | 系統內建（seed data） | 使用者只選擇不建立，降低複雜度 |
| 進階功能 | 全部納入（懶載入 + 歷史生成） | 使用者要求完整複製 AionUi 功能 |
| 資料儲存 | DB-backed（方案 B） | 與 NexusMind Supabase 架構一致 |

## 功能清單（6 項）

### F1: Assistant Preset 資料系統
- `assistant_presets` 表 + API + seed data（4-5 個預設助手）

### F2: Assistant Selection UI（膠囊選擇區）
- 歡迎畫面輸入框下方，膠囊式按鈕列
- 選中展開：描述 + 快捷提示按鈕

### F3: Skill 注入 on Conversation Creation
- 選擇助手後送出訊息時，將 preset 的 skills/rules 寫入 conversation.extra
- system_prompt 合併（preset + persona）

### F4: 快捷提示按鈕（per-Assistant）
- 每個助手有專屬快捷提示，點擊填入輸入框並送出

### F5: Skill 懶載入（Lazy Loading）
- 對話開始只注入技能索引
- AI 回應中 [LOAD_SKILL: name] 觸發完整載入

### F6: Skill/Rule 生成器（從對話歷史）
- 魔法棒按鈕 + Gemini 分析對話歷史
- 從檔案載入技能/規則

## 資料模型

```sql
CREATE TABLE assistant_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  avatar TEXT NOT NULL,
  description TEXT,
  description_en TEXT,
  system_prompt TEXT,
  enabled_skill_ids UUID[],
  rules JSONB DEFAULT '[]',
  quick_prompts JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
