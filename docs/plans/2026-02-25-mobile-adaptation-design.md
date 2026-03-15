# NexusMind 手機適配設計文件

**日期**：2026-02-25
**方案**：逐頁漸進式修復（方案 A）
**方法**：TDD（Red → Green → Refactor）

---

## 需求決策

| 項目 | 決策 |
|------|------|
| 適配範圍 | 全功能 — 所有頁面 |
| 複雜佈局策略 | 抽屜式 — 輔助面板從底部/右側滑出 |
| 知識圖譜 | 列表替代 — 手機用卡片列表呈現 |
| 導航 | 保持現狀 — 漢堡選單 + overlay 側邊欄，修好細節 |
| 手勢 | 不需要 — 標準點擊/滾動 |

---

## 1. 共用基礎設施

### 1.1 Viewport Meta Tag

在 `src/app/layout.tsx` 加入 Next.js viewport export：

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

### 1.2 useIsMobile Hook

新增 `src/hooks/use-is-mobile.ts`：

- 以 768px（md 斷點）為分界
- 使用 matchMedia API + resize 事件監聽
- SSR 安全 — 預設 false，hydration 後更新
- 全站共用

### 1.3 MobileDrawer 元件

新增 `src/components/ui/mobile-drawer.tsx`：

- Props：`open`、`onClose`、`side`（'bottom' | 'right'）、`title`、`children`
- 背景遮罩 + 點擊關閉、滑入/滑出動畫（transition-transform）
- 底部抽屜：最大高度 80vh，可滾動內容
- 右側抽屜：寬度 85vw，全高
- 只在 useIsMobile() === true 時啟用

---

## 2. 逐頁適配策略

### 2.1 聊天頁面（Chat）

- 訊息氣泡 padding 手機端縮小（px-3 md:px-4）
- 輸入框工具列：手機端收合次要按鈕到「+」選單
- 側邊欄對話歷史：修正 overlay 關閉後焦點回歸

### 2.2 知識庫頁面（Knowledge）

- useIsMobile() 條件渲染：
  - 桌面：保持現有佈局（圖譜 + 文件列表並排）
  - 手機：隱藏 Cytoscape 圖譜，改用卡片列表顯示知識節點
- 卡片列表：節點名稱、關聯數量、點擊展開關聯節點
- 上傳功能：手機端全寬按鈕，上傳狀態用 toast 提示
- 文件詳情：MobileDrawer side="bottom" 從底部滑出

### 2.3 深度研究頁面（Research）

- 手機端改為單欄全屏顯示研究結果
- 來源列表放入 MobileDrawer side="right"，浮動按鈕「查看來源」觸發
- 研究進度條手機端固定於頂部

### 2.4 Canvas 頁面

- 手機端改為單欄，預設顯示預覽
- 頂部 Tab 切換「編輯 / 預覽」（僅手機端顯示）
- 編輯器手機端全寬，字型稍微縮小

### 2.5 圖表頁面（Diagram）

- 工具列從側邊改為手機端頂部水平滾動
- 圖表區全屏，支援標準捏合縮放（Cytoscape 內建）
- 節點詳情用 MobileDrawer side="bottom" 展開

### 2.6 設定頁面（Settings）

- 微調表單元素間距（手機端 gap-3 → gap-4 增加觸控友好度）
- 長表單手機端用 accordion 收合分組

---

## 3. 全站響應式修正

| 項目 | 改動 |
|------|------|
| 文字大小 | 標題 text-2xl md:text-4xl，內文 text-sm md:text-base |
| Padding | 容器 px-4 md:px-6 lg:px-8，統一漸進式間距 |
| 按鈕 | 手機端最小觸控區域 min-h-[44px] min-w-[44px] |
| Modal/Dialog | 手機端全屏或近全屏（w-full md:max-w-lg） |
| 表格 | 寬表格手機端加 overflow-x-auto 水平滾動 |

### ResponsiveLayout 微調

- 確保 sidebar overlay 的 z-index 不被蓋住
- 關閉側邊欄後正確移除 body overflow-hidden
- Header 高度統一 h-14

---

## 4. 測試策略

### 共用元件測試（Unit）

- useIsMobile — matchMedia mock、resize 觸發、SSR 預設值
- MobileDrawer — 開/關渲染、side prop 方向、背景遮罩點擊關閉

### 頁面級測試（Integration）

- 每個改動頁面測試 2 場景：
  - window.innerWidth = 375（手機）→ 驗證手機佈局渲染
  - window.innerWidth = 1024（桌面）→ 驗證桌面佈局不受影響
- 測試重點：條件渲染切換、MobileDrawer 開關、知識庫卡片列表渲染

### 不做 E2E

手機適配主要是 CSS/條件渲染，單元 + 整合測試足以覆蓋。視覺正確性靠手動在真機/DevTools 驗證。

---

## 5. 成功標準

| 指標 | 目標 |
|------|------|
| 所有頁面在 375px 寬度可用 | 無水平溢出、無被裁切的元素 |
| 新增元件測試覆蓋率 | ≥ 80% |
| 現有測試不 regression | 全部通過 |
| Build 成功 | npm run build 無錯誤 |
