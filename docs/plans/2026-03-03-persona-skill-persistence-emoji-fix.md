# Persona/Skill 持久化 + Emoji 一致性修復 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修復頁面導航後角色/技能選擇消失的問題，並修正對話頂部 header emoji 與卡片 emoji 不一致的問題。

**Architecture:**
- 使用 `sessionStorage` 在 `nexusmind-chat.tsx` 層面統一持久化 `selectedItem`（不分散到個別 hook）
- 將 `getPersonaIconText` 從 `assistant-skill-selector.tsx` 提取為 exported 函數，供 header 使用
- Skill 選擇的持久化也統一在 `nexusmind-chat.tsx` 處理，無需改動 `useSkills` hook

**Tech Stack:** React 18, sessionStorage, TypeScript, Next.js

---

## 根因分析（已確認）

### Bug 1 & 2: Persona + Skill 持久化

| 位置 | 問題 |
|------|------|
| `useCapsulePersonas.ts:42` | `selectedPersonaId = useState(null)` — 頁面導航後重置 |
| `nexusmind-chat.tsx:403` | `selectedItem = useState(null)` — 頁面導航後重置 |
| `nexusmind-chat.tsx:408-416` | `hasUserInteracted.current` guard 阻止了 capsule 的自動同步恢復 |

### Bug 3: Emoji 不一致

| 位置 | 問題 |
|------|------|
| `nexusmind-chat.tsx:2554-2556` | Header 永遠顯示 `🤖`（persona）和 `⚡️`（skill），忽略實際 `persona.icon` |
| `assistant-skill-selector.tsx:197` | 卡片用 `renderPersonaIcon(persona.icon)` 顯示真實 icon |

---

## Task 1: 提取並 Export Icon 工具函數

**Files:**
- Modify: `src/components/chat/assistant-skill-selector.tsx:56-87`

**Step 1: 將 `getPersonaIconText` 和 `getSkillIcon` 改為 exported**

在 `assistant-skill-selector.tsx` 中，找到這兩個 local functions，加上 `export`：

```typescript
// 修改前:
function getPersonaIconText(iconValue: string): string {
// 修改後:
export function getPersonaIconText(iconValue: string): string {
```

```typescript
// 修改前:
function getSkillIcon(icon: string): string {
// 修改後:
export function getSkillIcon(icon: string): string {
```

**Step 2: 驗證 TypeScript 編譯**

```bash
cd /Users/show/Desktop/Claude\ code\ agent/Projects/Full_dev/nexusmind
npx tsc --noEmit 2>&1 | head -20
```
Expected: 無錯誤（或與本次修改無關的既有錯誤）

**Step 3: Commit**

```bash
git add src/components/chat/assistant-skill-selector.tsx
git commit -m "refactor: export getPersonaIconText and getSkillIcon for reuse"
```

---

## Task 2: 修復 Header Emoji 不一致

**Files:**
- Modify: `src/components/crayon/nexusmind-chat.tsx:2554-2556`

**Background:**
- `persona.icon` 可能是 Lucide icon name（如 "Bot"）或直接是 emoji（如 "🧑‍💻"）
- `getPersonaIconText` 已處理兩種情況：Lucide name → emoji mapping，其他直接回傳
- Header 目前 hardcode `🤖`，與卡片顯示不同步

**Step 1: 在 nexusmind-chat.tsx 頂部 import icon 工具**

找到現有 import 區域，加入：
```typescript
import { getPersonaIconText, getSkillIcon } from "@/components/chat/assistant-skill-selector";
```

**Step 2: 修改 header 顯示邏輯（約 line 2554-2556）**

找到此段：
```tsx
{selectedItem
  ? (selectedItem.type === "persona" ? `🤖 ${selectedItem.persona.name}` : `⚡️ ${selectedItem.skill.display_name}`)
  : `🤖 ${selectedPersona.name}`}
```

替換為：
```tsx
{selectedItem
  ? (selectedItem.type === "persona"
      ? `${getPersonaIconText(selectedItem.persona.icon)} ${selectedItem.persona.name}`
      : `${getSkillIcon(selectedItem.skill.icon)} ${selectedItem.skill.display_name}`)
  : `${getPersonaIconText(selectedPersona.icon)} ${selectedPersona.name}`}
```

**Step 3: 驗證 TypeScript 編譯**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/crayon/nexusmind-chat.tsx
git commit -m "fix: use actual persona/skill icon in conversation header instead of hardcoded emoji"
```

---

## Task 3: 實作 Persona + Skill 持久化（sessionStorage）

**Files:**
- Modify: `src/components/crayon/nexusmind-chat.tsx`

**Design 決策：**
- 持久化層在 `nexusmind-chat.tsx`（不分散到 useCapsulePersonas）
- Storage key: `nexusmind:selected_item` → `{ type: "persona" | "skill", id: string } | null`
- 恢復時機：personas 與 skills 首次載入完成後（各自）
- 防止重複恢復：`hasRestoredRef = useRef(false)`
- SessionStorage（非 localStorage）：關閉瀏覽器自動清除，避免 stale state

**Step 1: 在 nexusmind-chat.tsx 的 state 區域加入 pendingRestoreRef**

找到 `const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);`（約 line 403）附近，
在其後加入：

```typescript
// ─── 選擇項持久化（sessionStorage） ───────────────
const SELECTED_ITEM_KEY = "nexusmind:selected_item" as const;
const hasRestoredRef = useRef(false);

/** 讀取 sessionStorage 中的 pending restore */
const pendingRestoreRef = useRef<{ type: "persona" | "skill"; id: string } | null>(() => {
  try {
    const raw = sessionStorage.getItem(SELECTED_ITEM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { type: "persona" | "skill"; id: string };
    if (parsed.type === "persona" || parsed.type === "skill") return parsed;
  } catch {
    // ignore
  }
  return null;
});
```

> **Note:** `useRef` 接受初始化函數（lazy）需改成在 component body 初始化（因 useRef 不支援 lazy init）。實際寫法見 Step 2。

**Step 2: 正確初始化 pendingRestoreRef（在 component body 中）**

實際代碼（替換 Step 1 的寫法）：

```typescript
// ─── 選擇項持久化（sessionStorage） ───────────────
const SELECTED_ITEM_KEY = "nexusmind:selected_item" as const;
const hasRestoredRef = useRef(false);
const pendingRestoreRef = useRef<{ type: "persona" | "skill"; id: string } | null>(null);

// 從 sessionStorage 讀取 pending restore（只在 mount 時執行一次）
useEffect(() => {
  try {
    const raw = sessionStorage.getItem(SELECTED_ITEM_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { type: "persona" | "skill"; id: string };
    if (parsed.type === "persona" || parsed.type === "skill") {
      pendingRestoreRef.current = parsed;
    }
  } catch {
    // ignore malformed data
  }
}, []); // 只執行一次
```

**Step 3: 修改 handleSelectPersonaUnified 寫入 sessionStorage**

找到現有的 `handleSelectPersonaUnified`（約 line 418-430），在 `setSelectedItem` 後加入 storage 寫入：

```typescript
const handleSelectPersonaUnified = useCallback(
  (personaId: string) => {
    hasUserInteracted.current = true;
    selectCapsulePersona(personaId);
    const persona = capsulePersonas.find((p) => p.id === personaId);
    if (persona) {
      setSelectedItem({ type: "persona", persona });
      setSelectedPersona(persona);
      // 持久化
      try {
        sessionStorage.setItem(
          SELECTED_ITEM_KEY,
          JSON.stringify({ type: "persona", id: personaId }),
        );
      } catch { /* ignore */ }
    }
  },
  [selectCapsulePersona, capsulePersonas],
);
```

**Step 4: 修改 handleSelectSkillUnified 寫入 sessionStorage**

找到現有的 `handleSelectSkillUnified`（約 line 432-438），加入 storage 寫入：

```typescript
const handleSelectSkillUnified = useCallback(
  (skill: Skill) => {
    hasUserInteracted.current = true;
    selectCapsulePersona("");
    setSelectedItem({ type: "skill", skill });
    // 持久化
    try {
      sessionStorage.setItem(
        SELECTED_ITEM_KEY,
        JSON.stringify({ type: "skill", id: skill.id }),
      );
    } catch { /* ignore */ }
  },
  [selectCapsulePersona],
);
```

**Step 5: 找到 handleDeselectUnified（或建立一個）並清除 sessionStorage**

搜尋 `onDeselect` 的 handler（在 nexusmind-chat.tsx 中找 setSelectedItem(null) 的位置）：

```bash
grep -n "setSelectedItem(null\|setSelectedItem(prev" src/components/crayon/nexusmind-chat.tsx
```

找到取消選擇的邏輯後，加入清除：
```typescript
// 在取消選擇時清除
try { sessionStorage.removeItem(SELECTED_ITEM_KEY); } catch { /* ignore */ }
```

**Step 6: 加入恢復 useEffect — Persona 恢復**

找到現有的 `useCapsulePersonas` 相關 useEffect，在其後加入：

```typescript
// ─── 恢復 persona 選擇（首次 capsule 載入完成後） ───
useEffect(() => {
  if (hasRestoredRef.current) return;
  if (capsuleLoading) return;
  const pending = pendingRestoreRef.current;
  if (!pending || pending.type !== "persona") return;
  if (capsulePersonas.length === 0) return;

  const persona = capsulePersonas.find((p) => p.id === pending.id);
  if (persona) {
    hasRestoredRef.current = true;
    hasUserInteracted.current = true; // 允許後續 capsule 同步
    selectCapsulePersona(pending.id);
    setSelectedItem({ type: "persona", persona });
    setSelectedPersona(persona);
    pendingRestoreRef.current = null;
  }
}, [capsuleLoading, capsulePersonas, selectCapsulePersona]);
```

**Step 7: 加入恢復 useEffect — Skill 恢復**

```typescript
// ─── 恢復 skill 選擇（首次 skills 載入完成後） ───
useEffect(() => {
  if (hasRestoredRef.current) return;
  if (isLoadingSkills) return;
  const pending = pendingRestoreRef.current;
  if (!pending || pending.type !== "skill") return;
  if (skills.length === 0) return;

  const skill = skills.find((s) => s.id === pending.id);
  if (skill) {
    hasRestoredRef.current = true;
    hasUserInteracted.current = true;
    selectCapsulePersona(""); // 確保 persona 取消選擇
    setSelectedItem({ type: "skill", skill });
    pendingRestoreRef.current = null;
  }
}, [isLoadingSkills, skills, selectCapsulePersona]);
```

**Step 8: 驗證 TypeScript 編譯**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: 無與本次修改相關的錯誤

**Step 9: 手動測試流程**

```
1. 開啟 http://localhost:3000（或 NAS）
2. 選擇一個 Persona 角色卡片
3. 確認 header 顯示該角色的正確 icon（非 🤖）
4. 輸入訊息並發送
5. 點擊側邊欄切換到另一個對話
6. 點擊側邊欄切換回原對話
7. ✅ 預期：header 仍顯示之前選的角色（非「一般助理」）
8. 重新整理頁面（F5）
9. ✅ 預期：角色自動恢復（sessionStorage 有值）
10. 選擇一個 Skill
11. 切換對話再切回
12. ✅ 預期：skill 仍為選中狀態
```

**Step 10: Commit**

```bash
git add src/components/crayon/nexusmind-chat.tsx
git commit -m "feat: persist selected persona/skill across navigation using sessionStorage"
```

---

## Task 4: 更新 useCapsulePersonas 同步邏輯

**Background:**
Task 3 中的恢復 useEffect 設定了 `hasUserInteracted.current = true`，讓後續的 capsule 同步 useEffect（line 408-416）可以正常運作。
但需確認既有的 capsule 同步 useEffect 不會在恢復後意外覆蓋選擇。

**Files:**
- Modify: `src/components/crayon/nexusmind-chat.tsx:407-416`

**Step 1: 驗證 capsule 同步不會造成衝突**

讀取現有 capsule 同步 useEffect（line 407-416）：
```typescript
useEffect(() => {
  if (!hasUserInteracted.current) return;
  if (capsuleSelectedPersona) {
    setSelectedItem({ type: "persona", persona: capsuleSelectedPersona });
  } else {
    setSelectedItem((prev) => (prev?.type === "skill" ? prev : null));
  }
}, [capsuleSelectedPersona]);
```

分析：
- 恢復時 `selectCapsulePersona(pending.id)` 會讓 `capsuleSelectedPersona` 有值
- 此 useEffect 會再次執行，設定 `selectedItem = { type: "persona", persona }` — 這是正確的，不會有衝突
- Skill 恢復時，`selectCapsulePersona("")` → `capsuleSelectedPersona` 為 null → `setSelectedItem((prev) => prev?.type === "skill" ? prev : null)` — skill 選擇不受影響 ✅

**Step 2: 若無衝突問題，此 Task 不需要修改**

如果測試確認正常，跳過 commit，進入 Task 5。

---

## Task 5: 建置驗證

**Step 1: 完整 Build 驗證**

```bash
cd /Users/show/Desktop/Claude\ code\ agent/Projects/Full_dev/nexusmind
npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully` 無 error

**Step 2: 若 Build 失敗**

使用 build-fix skill 修復，或根據錯誤訊息調整。

**Step 3: 最終 commit（若 Task 4 有修改）**

```bash
git add -A
git commit -m "fix: persona/skill persistence and emoji consistency"
```

---

## 總結

| # | 修復 | 影響範圍 |
|---|------|----------|
| T1 | Export icon utils | `assistant-skill-selector.tsx` |
| T2 | Header emoji 使用實際 icon | `nexusmind-chat.tsx` (1 行) |
| T3 | Persona + Skill sessionStorage 持久化 | `nexusmind-chat.tsx` (+~40 行) |
| T4 | 驗證 capsule 同步不衝突 | 可能不需修改 |
| T5 | Build 驗證 | — |

**風險評估：**
- sessionStorage 在 private browsing 可能不可用 → try-catch 已處理
- skill 或 persona 被刪除後 sessionStorage 有 stale ID → 找不到時靜默忽略 ✅
- 多個 Tab 共用 sessionStorage → sessionStorage 是 per-tab 的，無衝突 ✅
