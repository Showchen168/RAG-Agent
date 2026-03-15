# 知識圖譜 Cytoscape.js 改造設計

**日期**：2026-02-25
**分支**：knowledgedraw
**狀態**：已核准

---

## 問題

現有知識圖譜使用 react-force-graph-2d，節點數量多時會擠在一團，難以閱讀和操作。

## 決策

用 Cytoscape.js 取代 react-force-graph-2d，採用 COSE-Bilkent 佈局算法（防重疊），標籤節點改為 compound parent nodes（可收合群組）。

## 核心改動

| 項目 | 現有 | 改造後 |
|------|------|--------|
| 渲染引擎 | react-force-graph-2d | Cytoscape.js |
| 力導向模式 | D3 force, charge=-400 | COSE-Bilkent (防重疊) |
| 標籤節點 | 與文件節點同級 | Compound parent nodes |
| 時間線模式 | DAG mode LR | Dagre layout (TB/LR) |
| 路徑探索 | 自寫 BFS | Cytoscape bfs()/aStar() |

## 三種模式

1. COSE 模式（取代力導向）- 防重疊 + compound nodes
2. Dagre 模式（取代時間線）- TB/LR 方向切換
3. 路徑模式（BFS 保留）- Cytoscape 內建算法

## 依賴變更

新增: cytoscape, cytoscape-cose-bilkent, cytoscape-dagre
移除: react-force-graph-2d
