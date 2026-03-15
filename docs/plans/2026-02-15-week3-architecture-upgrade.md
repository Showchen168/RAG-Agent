# Week 3+ 架構升級：Mastra Agent 化 + Knowledge Pipeline 優化

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將 NexusMind 的 Deep Research 系統從手動函式編排升級為 Mastra Agent 化架構，並參考 Dify Knowledge Pipeline 概念優化知識摘取管道。

**Architecture:** 引入 Mastra 框架作為 Agent 編排層，將現有 3 階段 Deep Research（問題拆解→並行研究→報告綜合）重構為 Mastra Workflow + 專責 Agent 協作模式。Knowledge Pipeline 參考 Dify 的「Data Source → Extractor → Chunker → Index」可視化管道概念，升級現有 content-fetcher 為可擴展的多階段 Pipeline，支援更多來源格式、智慧分塊策略與知識品質回饋迴路。

**Tech Stack:** Mastra Core (`@mastra/core`), Mastra AI SDK (`@mastra/ai-sdk`), Mastra RAG (`@mastra/rag`), Vercel AI SDK v6, Supabase pgvector, Next.js 16 App Router, Google Gemini API

---

## Phase 概覽

| Phase | 名稱 | 任務量 | 預估時間 |
|:---:|------|:---:|:---:|
| 0 | Mastra 基礎建設 | Task 1-3 | 1 天 |
| 1 | Deep Research Agent 化 | Task 4-9 | 2 天 |
| 2 | Knowledge Pipeline 優化 | Task 10-15 | 2 天 |
| 3 | 整合測試與收尾 | Task 16-18 | 1 天 |

---

## Phase 0：Mastra 基礎建設

### Task 1：安裝 Mastra 依賴

**Files:**
- Modify: `package.json`

**Step 1: 安裝 Mastra 核心套件**

```bash
cd /Users/show/Desktop/Claude\ code\ agent/Projects/MVP\ Demo/nexusmind_C
npm install @mastra/core @mastra/ai-sdk @mastra/rag --legacy-peer-deps
```

**Step 2: 驗證安裝**

```bash
node -e "const m = require('@mastra/core'); console.log('Mastra loaded:', typeof m)"
```

Expected: `Mastra loaded: object`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 安裝 Mastra 框架依賴 (@mastra/core, @mastra/ai-sdk, @mastra/rag)"
```

---

### Task 2：建立 Mastra 初始化模組

**Files:**
- Create: `src/lib/mastra/index.ts`
- Create: `src/lib/mastra/config.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/mastra-init.test.ts
import { describe, it, expect, jest } from '@jest/globals'

// Mock env
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'

describe('Mastra 初始化', () => {
  it('應該匯出 mastra 實例', async () => {
    const { mastra } = await import('@/lib/mastra')
    expect(mastra).toBeDefined()
  })

  it('應該能取得 research agent', async () => {
    const { mastra } = await import('@/lib/mastra')
    const agent = mastra.getAgent('deep-research-orchestrator')
    expect(agent).toBeDefined()
  })
})
```

**Step 2: 跑測試確認失敗**

```bash
npx jest tests/lib/mastra/mastra-init.test.ts --no-cache
```

Expected: FAIL — 模組不存在

**Step 3: 建立 Mastra config**

```typescript
// src/lib/mastra/config.ts
import { google } from '@ai-sdk/google'

export const MASTRA_CONFIG = {
  models: {
    flash: google('gemini-2.5-flash-preview-05-20'),
    pro: google('gemini-2.5-pro-preview-05-06'),
  },
  embedding: {
    model: 'gemini-embedding-001',
    dimensions: 768,
  },
  research: {
    maxSubQuestions: 5,
    maxSearchSteps: 5,
    parallelConcurrency: 3,
  },
} as const
```

**Step 4: 建立 Mastra 主實例**

```typescript
// src/lib/mastra/index.ts
import { Mastra } from '@mastra/core'
import { deepResearchOrchestrator } from './agents/research-orchestrator'
import { deepResearchWorkflow } from './workflows/deep-research-workflow'

export const mastra = new Mastra({
  agents: {
    'deep-research-orchestrator': deepResearchOrchestrator,
  },
  workflows: {
    'deep-research': deepResearchWorkflow,
  },
})
```

> 注意：此處 agents 和 workflows 會在 Task 4-6 逐步建立，此任務先建立骨架結構。

**Step 5: 跑測試確認通過**

**Step 6: Commit**

```bash
git add src/lib/mastra/ tests/lib/mastra/
git commit -m "feat: 建立 Mastra 初始化模組與設定"
```

---

### Task 3：建立 Mastra Tools 基礎

**Files:**
- Create: `src/lib/mastra/tools/web-search.ts`
- Create: `src/lib/mastra/tools/vector-search.ts`
- Create: `src/lib/mastra/tools/index.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/tools/tools.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Mastra Tools', () => {
  it('webSearchTool 應該有正確的 id', async () => {
    const { webSearchTool } = await import('@/lib/mastra/tools')
    expect(webSearchTool.id).toBe('web-search')
  })

  it('vectorSearchTool 應該有正確的 id', async () => {
    const { vectorSearchTool } = await import('@/lib/mastra/tools')
    expect(vectorSearchTool.id).toBe('vector-search')
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 Web Search Tool**

```typescript
// src/lib/mastra/tools/web-search.ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { google } from '@ai-sdk/google'

export const webSearchTool = createTool({
  id: 'web-search',
  description: '使用 Google Search 進行即時網路搜尋，取得最新資訊',
  inputSchema: z.object({
    query: z.string().describe('搜尋查詢'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    // 使用 Gemini Google Search grounding tool
    // 實際實作會透過 Agent 的 maxSteps + tool call 機制
    return { results: [] }
  },
})
```

**Step 4: 實作 Vector Search Tool（包裝現有 Supabase pgvector）**

```typescript
// src/lib/mastra/tools/vector-search.ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const vectorSearchTool = createTool({
  id: 'vector-search',
  description: '從 NexusMind 知識庫搜尋相關文件片段',
  inputSchema: z.object({
    query: z.string().describe('搜尋查詢'),
    userId: z.string().describe('使用者 ID'),
    matchThreshold: z.number().optional().default(0.6),
    matchCount: z.number().optional().default(12),
  }),
  outputSchema: z.object({
    chunks: z.array(z.object({
      content: z.string(),
      similarity: z.number(),
      documentId: z.string(),
      documentTitle: z.string(),
      chunkIndex: z.number(),
    })),
    relevanceScore: z.number(),
  }),
  execute: async ({ context }) => {
    // 包裝現有 adaptive-rag 的 embed + match_documents 邏輯
    return { chunks: [], relevanceScore: 0 }
  },
})
```

**Step 5: 建立 barrel export**

```typescript
// src/lib/mastra/tools/index.ts
export { webSearchTool } from './web-search'
export { vectorSearchTool } from './vector-search'
```

**Step 6: 跑測試確認通過**

**Step 7: Commit**

```bash
git add src/lib/mastra/tools/ tests/lib/mastra/tools/
git commit -m "feat: 建立 Mastra Tools (web-search, vector-search)"
```

---

## Phase 1：Deep Research Agent 化

### Task 4：建立 Question Decomposer Agent

**Files:**
- Create: `src/lib/mastra/agents/question-decomposer.ts`
- Modify: 參考 `src/lib/research/question-decomposer.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/agents/question-decomposer.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Question Decomposer Agent', () => {
  it('應該匯出正確配置的 agent', async () => {
    const { questionDecomposerAgent } = await import(
      '@/lib/mastra/agents/question-decomposer'
    )
    expect(questionDecomposerAgent.id).toBe('question-decomposer')
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 Question Decomposer Agent**

```typescript
// src/lib/mastra/agents/question-decomposer.ts
import { Agent } from '@mastra/core/agent'
import { MASTRA_CONFIG } from '../config'

export const questionDecomposerAgent = new Agent({
  id: 'question-decomposer',
  name: 'Question Decomposer',
  instructions: `你是一位研究問題拆解專家。
任務：將複雜的研究主題拆解為 2-5 個 MECE（互斥且完整覆蓋）的子問題。

規則：
1. 子問題之間不應有重疊
2. 合在一起應完整涵蓋原始主題
3. 每個子問題必須可被獨立搜尋
4. 優先級：high（核心問題）> medium（補充脈絡）> low（延伸探索）
5. 為每個子問題生成最佳搜尋查詢（英文關鍵字優先）

輸出格式：嚴格的 JSON 結構。`,
  model: MASTRA_CONFIG.models.pro,
})
```

**Step 4: 跑測試確認通過**

**Step 5: Commit**

```bash
git add src/lib/mastra/agents/ tests/lib/mastra/agents/
git commit -m "feat: 建立 Question Decomposer Agent (Mastra)"
```

---

### Task 5：建立 Parallel Researcher Agent

**Files:**
- Create: `src/lib/mastra/agents/parallel-researcher.ts`
- Modify: 參考 `src/lib/research/parallel-researcher.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/agents/parallel-researcher.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Parallel Researcher Agent', () => {
  it('應該匯出正確配置的 agent', async () => {
    const { parallelResearcherAgent } = await import(
      '@/lib/mastra/agents/parallel-researcher'
    )
    expect(parallelResearcherAgent.id).toBe('parallel-researcher')
  })

  it('應該配備 web-search tool', async () => {
    const { parallelResearcherAgent } = await import(
      '@/lib/mastra/agents/parallel-researcher'
    )
    expect(parallelResearcherAgent.tools).toHaveProperty('webSearchTool')
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作**

```typescript
// src/lib/mastra/agents/parallel-researcher.ts
import { Agent } from '@mastra/core/agent'
import { MASTRA_CONFIG } from '../config'
import { webSearchTool } from '../tools'

export const parallelResearcherAgent = new Agent({
  id: 'parallel-researcher',
  name: 'Parallel Researcher',
  instructions: `你是一位深度研究分析師。
針對給定的研究子問題，使用網路搜尋工具進行深入調查。

研究要求：
1. 使用 web-search 工具搜尋最新資訊
2. 每個子問題產出 4-6 句摘要
3. 提取 5-6 個具體發現（含數據、日期、來源）
4. 收集 5+ 個參考 URL
5. 優先選擇權威來源（學術、政府、產業領袖）
6. 回應語言：繁體中文`,
  model: MASTRA_CONFIG.models.pro,
  tools: { webSearchTool },
})
```

**Step 4: 跑測試確認通過**

**Step 5: Commit**

```bash
git commit -m "feat: 建立 Parallel Researcher Agent (Mastra + Google Search)"
```

---

### Task 6：建立 Report Synthesizer Agent

**Files:**
- Create: `src/lib/mastra/agents/report-synthesizer.ts`
- Modify: 參考 `src/lib/research/research-synthesizer.ts`

**Step 1: 寫失敗測試**

**Step 2: 跑測試確認失敗**

**Step 3: 實作**

```typescript
// src/lib/mastra/agents/report-synthesizer.ts
import { Agent } from '@mastra/core/agent'
import { MASTRA_CONFIG } from '../config'

export const reportSynthesizerAgent = new Agent({
  id: 'report-synthesizer',
  name: 'Report Synthesizer',
  instructions: `你是一位研究報告綜合專家。
將多個研究子問題的發現整合為一份完整的深度研究報告。

報告結構：
1. 標題（具體、有吸引力、反映核心發現）
2. 執行摘要（5-8 句話概括關鍵結論）
3. 背景與現況分析（含量化指標）
4. 核心議題深度剖析（跨子問題交叉分析）
5. 挑戰、風險與機會
6. 趨勢展望與策略方向
7. 結論與建議（3-5 條可執行建議）
8. 參考來源（去重後的完整清單）

品質要求：
- 使用具體數據和案例支撐論點
- 跨子問題進行矛盾檢測與交叉驗證
- 使用繁體中文（台灣用語）`,
  model: MASTRA_CONFIG.models.pro,
})
```

**Step 4: 跑測試確認通過**

**Step 5: Commit**

```bash
git commit -m "feat: 建立 Report Synthesizer Agent (Mastra)"
```

---

### Task 7：建立 Deep Research Workflow（Mastra Graph）

**Files:**
- Create: `src/lib/mastra/workflows/deep-research-workflow.ts`
- Create: `src/lib/mastra/workflows/steps/decompose-step.ts`
- Create: `src/lib/mastra/workflows/steps/research-step.ts`
- Create: `src/lib/mastra/workflows/steps/synthesize-step.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/workflows/deep-research.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Deep Research Workflow', () => {
  it('應該匯出正確的 workflow', async () => {
    const { deepResearchWorkflow } = await import(
      '@/lib/mastra/workflows/deep-research-workflow'
    )
    expect(deepResearchWorkflow).toBeDefined()
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 decompose step**

```typescript
// src/lib/mastra/workflows/steps/decompose-step.ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

export const decomposeStep = createStep({
  id: 'decompose-topic',
  description: '將研究主題拆解為 MECE 子問題',
  inputSchema: z.object({
    topic: z.string(),
    context: z.string().optional(),
  }),
  outputSchema: z.object({
    mainTopic: z.string(),
    subQuestions: z.array(z.object({
      id: z.string(),
      question: z.string(),
      searchQuery: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    })),
    researchScope: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('question-decomposer')
    if (!agent) throw new Error('question-decomposer agent not found')

    const result = await agent.generate(
      `請拆解以下研究主題為 2-5 個 MECE 子問題：\n\n主題：${inputData.topic}${inputData.context ? `\n背景：${inputData.context}` : ''}`,
      { output: 'object' }
    )

    return result.object
  },
})
```

**Step 4: 實作 research step（並行執行）**

```typescript
// src/lib/mastra/workflows/steps/research-step.ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

export const researchStep = createStep({
  id: 'parallel-research',
  description: '對所有子問題進行並行網路搜尋研究',
  inputSchema: z.object({
    mainTopic: z.string(),
    subQuestions: z.array(z.object({
      id: z.string(),
      question: z.string(),
      searchQuery: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    })),
    researchScope: z.string(),
  }),
  outputSchema: z.object({
    findings: z.array(z.object({
      subQuestionId: z.string(),
      question: z.string(),
      summary: z.string(),
      keyFindings: z.array(z.string()),
      sources: z.array(z.object({
        title: z.string(),
        url: z.string(),
      })),
    })),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('parallel-researcher')
    if (!agent) throw new Error('parallel-researcher agent not found')

    // 並行處理所有子問題
    const findingsPromises = inputData.subQuestions.map(async (sq) => {
      const result = await agent.generate(
        `研究子問題：${sq.question}\n搜尋查詢：${sq.searchQuery}\n\n請進行深入網路搜尋研究，回傳 JSON 格式結果。`
      )
      return {
        subQuestionId: sq.id,
        question: sq.question,
        summary: result.text || '',
        keyFindings: [],
        sources: [],
      }
    })

    const findings = await Promise.all(findingsPromises)
    return { findings }
  },
})
```

**Step 5: 實作 synthesize step**

```typescript
// src/lib/mastra/workflows/steps/synthesize-step.ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

export const synthesizeStep = createStep({
  id: 'synthesize-report',
  description: '綜合所有研究發現，生成完整報告',
  inputSchema: z.object({
    findings: z.array(z.object({
      subQuestionId: z.string(),
      question: z.string(),
      summary: z.string(),
      keyFindings: z.array(z.string()),
      sources: z.array(z.object({
        title: z.string(),
        url: z.string(),
      })),
    })),
  }),
  outputSchema: z.object({
    title: z.string(),
    executiveSummary: z.string(),
    sections: z.array(z.object({
      heading: z.string(),
      content: z.string(),
    })),
    recommendations: z.array(z.string()),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('report-synthesizer')
    if (!agent) throw new Error('report-synthesizer agent not found')

    const findingsText = inputData.findings
      .map(f => `## ${f.question}\n${f.summary}\n### 關鍵發現\n${f.keyFindings.map(k => `- ${k}`).join('\n')}`)
      .join('\n\n')

    const result = await agent.generate(
      `請根據以下研究發現，撰寫一份完整的深度研究報告：\n\n${findingsText}`
    )

    return {
      title: '',
      executiveSummary: result.text || '',
      sections: [],
      recommendations: [],
      sources: inputData.findings.flatMap(f => f.sources),
    }
  },
})
```

**Step 6: 組合 Workflow**

```typescript
// src/lib/mastra/workflows/deep-research-workflow.ts
import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { decomposeStep } from './steps/decompose-step'
import { researchStep } from './steps/research-step'
import { synthesizeStep } from './steps/synthesize-step'

export const deepResearchWorkflow = createWorkflow({
  id: 'deep-research',
  description: '端到端深度研究流程：問題拆解 → 並行搜尋 → 報告綜合',
  inputSchema: z.object({
    topic: z.string(),
    context: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    executiveSummary: z.string(),
    sections: z.array(z.object({
      heading: z.string(),
      content: z.string(),
    })),
    recommendations: z.array(z.string()),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })),
  }),
})
  .then(decomposeStep)
  .then(researchStep)
  .then(synthesizeStep)
  .commit()
```

**Step 7: 跑測試確認通過**

**Step 8: Commit**

```bash
git add src/lib/mastra/workflows/ tests/lib/mastra/workflows/
git commit -m "feat: 建立 Deep Research Workflow (3-step Mastra graph)"
```

---

### Task 8：建立 Research Orchestrator Agent

**Files:**
- Create: `src/lib/mastra/agents/research-orchestrator.ts`

**說明：** 這是頂層 Agent，使用者直接與此 Agent 對話，它會自動調用 deep-research workflow 作為工具。

**Step 1: 寫失敗測試**

```typescript
// tests/lib/mastra/agents/research-orchestrator.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Research Orchestrator Agent', () => {
  it('應該匯出正確配置的 agent', async () => {
    const { deepResearchOrchestrator } = await import(
      '@/lib/mastra/agents/research-orchestrator'
    )
    expect(deepResearchOrchestrator.id).toBe('deep-research-orchestrator')
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作**

```typescript
// src/lib/mastra/agents/research-orchestrator.ts
import { Agent } from '@mastra/core/agent'
import { MASTRA_CONFIG } from '../config'
import { vectorSearchTool } from '../tools'
import { deepResearchWorkflow } from '../workflows/deep-research-workflow'

export const deepResearchOrchestrator = new Agent({
  id: 'deep-research-orchestrator',
  name: 'Deep Research Orchestrator',
  instructions: `你是 NexusMind 深度研究指揮官。

你的職責：
1. 接收使用者的研究主題
2. 先檢查知識庫是否有相關資料（使用 vector-search）
3. 啟動 deep-research workflow 進行完整研究
4. 回報研究進度給使用者
5. 交付最終研究報告

決策邏輯：
- 若知識庫覆蓋度 > 70%：優先使用本地知識 + 補充性搜尋
- 若知識庫覆蓋度 < 30%：全面網路研究
- 中間地帶：混合策略

語言：繁體中文（台灣用語）`,
  model: MASTRA_CONFIG.models.pro,
  tools: { vectorSearchTool },
  workflows: { deepResearchWorkflow },
})
```

**Step 4: 跑測試確認通過**

**Step 5: Commit**

```bash
git commit -m "feat: 建立 Research Orchestrator Agent (頂層指揮)"
```

---

### Task 9：替換 API Route（Deep Research）

**Files:**
- Modify: `src/app/api/research/deep/route.ts`
- Preserve: `src/lib/research/` (舊實作保留為 fallback)

**Step 1: 寫整合測試**

```typescript
// tests/api/research-deep-mastra.test.ts
import { describe, it, expect } from '@jest/globals'

describe('POST /api/research/deep (Mastra)', () => {
  it('應該返回 SSE stream', async () => {
    // 模擬 API 呼叫，驗證回傳 content-type 為 text/event-stream
  })
})
```

**Step 2: 修改 API route 使用 Mastra workflow**

核心改動：
- 用 `mastra.getWorkflow('deep-research').execute()` 替換手動的 3 階段呼叫
- 保持 SSE stream 格式不變（前端不需改動）
- 加入 `USE_MASTRA_RESEARCH=true` 環境變數作為 feature flag

```typescript
// src/app/api/research/deep/route.ts 的核心改動
import { mastra } from '@/lib/mastra'

const USE_MASTRA = process.env.USE_MASTRA_RESEARCH === 'true'

if (USE_MASTRA) {
  const workflow = mastra.getWorkflow('deep-research')
  const run = await workflow.execute({ inputData: { topic, context } })
  // 轉換為 SSE events...
} else {
  // 保留原有邏輯作為 fallback
}
```

**Step 3: 跑整合測試**

**Step 4: Commit**

```bash
git commit -m "feat: API route 支援 Mastra Deep Research (feature flag)"
```

---

## Phase 2：Knowledge Pipeline 優化（參考 Dify）

### Task 10：設計 Pipeline 架構

**Files:**
- Create: `src/lib/pipeline/types.ts`

**說明：** 參考 Dify Knowledge Pipeline 的「Data Source → Extractor → Chunker → Indexer」概念，設計可擴展的管道架構。

**Step 1: 定義 Pipeline 型別**

```typescript
// src/lib/pipeline/types.ts

/** Pipeline 節點介面 */
export interface PipelineNode<TInput, TOutput> {
  readonly id: string
  readonly type: 'source' | 'extractor' | 'chunker' | 'enricher' | 'indexer'
  readonly name: string
  execute(input: TInput): Promise<TOutput>
}

/** 文件來源類型 */
export type SourceType =
  | 'file-upload'    // PDF/Word/Excel
  | 'url'            // 單一網頁
  | 'rss'            // RSS 訂閱源
  | 'google-drive'   // Google Drive
  | 'api'            // 外部 API

/** 提取後的原始文本 */
export interface ExtractedContent {
  readonly text: string
  readonly metadata: {
    readonly source: string
    readonly sourceType: SourceType
    readonly title: string
    readonly contentHash: string
    readonly extractedAt: string
    readonly pageCount?: number
    readonly language?: string
  }
}

/** 分塊策略 */
export type ChunkStrategy =
  | 'fixed-size'        // 固定大小 (Dify: General Chunker)
  | 'semantic'          // 語義分塊
  | 'parent-child'      // 父子分塊 (Dify: Parent-child Chunker)
  | 'qa-extraction'     // QA 對提取 (Dify: Q&A Processor)

/** 分塊後的內容 */
export interface ChunkedContent {
  readonly chunks: ReadonlyArray<{
    readonly text: string
    readonly index: number
    readonly metadata: {
      readonly parentChunkIndex?: number
      readonly pageNumber?: number
      readonly heading?: string
    }
  }>
  readonly strategy: ChunkStrategy
  readonly totalChunks: number
}

/** 知識品質信號 */
export interface QualitySignals {
  readonly completeness: number      // 0-1 完整度
  readonly coherence: number         // 0-1 連貫性
  readonly duplicateRatio: number    // 0-1 重複比例
  readonly languageConfidence: number // 0-1 語言辨識度
}

/** Pipeline 執行結果 */
export interface PipelineResult {
  readonly documentId: string
  readonly chunksIndexed: number
  readonly qualitySignals: QualitySignals
  readonly processingTimeMs: number
  readonly errors: ReadonlyArray<string>
}
```

**Step 2: Commit**

```bash
git add src/lib/pipeline/
git commit -m "feat: 定義 Knowledge Pipeline 型別系統 (參考 Dify)"
```

---

### Task 11：實作 Extractor 節點

**Files:**
- Create: `src/lib/pipeline/extractors/pdf-extractor.ts`
- Create: `src/lib/pipeline/extractors/url-extractor.ts`
- Create: `src/lib/pipeline/extractors/rss-extractor.ts`
- Create: `src/lib/pipeline/extractors/index.ts`

**說明：** 將現有 `file-parser.ts` 和 `content-fetcher.ts` 的邏輯包裝為標準 PipelineNode 介面。

**Step 1: 寫失敗測試**

```typescript
// tests/lib/pipeline/extractors/pdf-extractor.test.ts
import { describe, it, expect } from '@jest/globals'

describe('PDF Extractor', () => {
  it('應該有 extractor 類型', async () => {
    const { pdfExtractor } = await import('@/lib/pipeline/extractors')
    expect(pdfExtractor.type).toBe('extractor')
    expect(pdfExtractor.id).toBe('pdf-extractor')
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 PDF Extractor（包裝現有 file-parser）**

```typescript
// src/lib/pipeline/extractors/pdf-extractor.ts
import type { PipelineNode, ExtractedContent } from '../types'
import { parseFile } from '@/lib/parsers/file-parser'
import crypto from 'crypto'

export const pdfExtractor: PipelineNode<Buffer, ExtractedContent> = {
  id: 'pdf-extractor',
  type: 'extractor',
  name: 'PDF 文件提取器',
  async execute(input: Buffer): Promise<ExtractedContent> {
    const text = await parseFile(input, 'application/pdf')
    const contentHash = crypto
      .createHash('sha256')
      .update(text)
      .digest('hex')

    return {
      text,
      metadata: {
        source: 'file-upload',
        sourceType: 'file-upload',
        title: '',
        contentHash,
        extractedAt: new Date().toISOString(),
      },
    }
  },
}
```

**Step 4: 實作 URL Extractor（包裝現有 content-fetcher）**

```typescript
// src/lib/pipeline/extractors/url-extractor.ts
import type { PipelineNode, ExtractedContent } from '../types'
import { fetchUrlContent } from '@/lib/knowledge/content-fetcher'

export const urlExtractor: PipelineNode<{ url: string }, ExtractedContent> = {
  id: 'url-extractor',
  type: 'extractor',
  name: 'URL 網頁提取器',
  async execute(input): Promise<ExtractedContent> {
    const { content, hash } = await fetchUrlContent(input.url)
    return {
      text: content,
      metadata: {
        source: input.url,
        sourceType: 'url',
        title: '',
        contentHash: hash,
        extractedAt: new Date().toISOString(),
      },
    }
  },
}
```

**Step 5: 實作 RSS Extractor**

```typescript
// src/lib/pipeline/extractors/rss-extractor.ts
import type { PipelineNode, ExtractedContent } from '../types'
import { fetchRssContent, enrichRssItems } from '@/lib/knowledge/content-fetcher'

export const rssExtractor: PipelineNode<{ url: string }, ExtractedContent> = {
  id: 'rss-extractor',
  type: 'extractor',
  name: 'RSS 訂閱源提取器',
  async execute(input): Promise<ExtractedContent> {
    const { items, hash } = await fetchRssContent(input.url)
    const enriched = await enrichRssItems(items)

    const text = enriched
      .map(item => `# ${item.title}\n${item.fullContent || item.description}`)
      .join('\n\n---\n\n')

    return {
      text,
      metadata: {
        source: input.url,
        sourceType: 'rss',
        title: '',
        contentHash: hash,
        extractedAt: new Date().toISOString(),
      },
    }
  },
}
```

**Step 6: Barrel export**

```typescript
// src/lib/pipeline/extractors/index.ts
export { pdfExtractor } from './pdf-extractor'
export { urlExtractor } from './url-extractor'
export { rssExtractor } from './rss-extractor'
```

**Step 7: 跑測試確認通過**

**Step 8: Commit**

```bash
git add src/lib/pipeline/extractors/ tests/lib/pipeline/
git commit -m "feat: 實作 Pipeline Extractors (PDF, URL, RSS)"
```

---

### Task 12：實作智慧 Chunker 節點

**Files:**
- Create: `src/lib/pipeline/chunkers/fixed-size-chunker.ts`
- Create: `src/lib/pipeline/chunkers/semantic-chunker.ts`
- Create: `src/lib/pipeline/chunkers/index.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/pipeline/chunkers/fixed-size-chunker.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Fixed Size Chunker', () => {
  it('應該將長文本分割為固定大小的塊', async () => {
    const { fixedSizeChunker } = await import('@/lib/pipeline/chunkers')
    const input = {
      text: 'A'.repeat(3000),
      metadata: { source: 'test', sourceType: 'file-upload' as const, title: 'Test', contentHash: 'abc', extractedAt: '2026-01-01' },
    }
    const result = await fixedSizeChunker.execute(input)
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.strategy).toBe('fixed-size')
    result.chunks.forEach(c => {
      expect(c.text.length).toBeLessThanOrEqual(1200)
    })
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 Fixed Size Chunker**

```typescript
// src/lib/pipeline/chunkers/fixed-size-chunker.ts
import type { PipelineNode, ExtractedContent, ChunkedContent } from '../types'

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP = 200

export const fixedSizeChunker: PipelineNode<ExtractedContent, ChunkedContent> = {
  id: 'fixed-size-chunker',
  type: 'chunker',
  name: '固定大小分塊器',
  async execute(input): Promise<ChunkedContent> {
    const { text } = input
    const chunks: ChunkedContent['chunks'][number][] = []
    let start = 0
    let index = 0

    while (start < text.length) {
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, text.length)
      chunks.push({
        text: text.slice(start, end),
        index,
        metadata: {},
      })
      start = end - DEFAULT_OVERLAP
      if (start >= text.length) break
      index++
    }

    return {
      chunks,
      strategy: 'fixed-size',
      totalChunks: chunks.length,
    }
  },
}
```

**Step 4: 實作 Semantic Chunker（使用 AI 判斷語義邊界）**

```typescript
// src/lib/pipeline/chunkers/semantic-chunker.ts
import type { PipelineNode, ExtractedContent, ChunkedContent } from '../types'

export const semanticChunker: PipelineNode<ExtractedContent, ChunkedContent> = {
  id: 'semantic-chunker',
  type: 'chunker',
  name: '語義分塊器',
  async execute(input): Promise<ChunkedContent> {
    const { text } = input
    // 策略：按段落 + 標題進行語義分塊
    const paragraphs = text.split(/\n{2,}/)
    const chunks: ChunkedContent['chunks'][number][] = []
    let currentChunk = ''
    let index = 0
    const MAX_CHUNK = 1500

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length > MAX_CHUNK && currentChunk) {
        chunks.push({ text: currentChunk.trim(), index, metadata: {} })
        index++
        currentChunk = para
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para
      }
    }
    if (currentChunk.trim()) {
      chunks.push({ text: currentChunk.trim(), index, metadata: {} })
    }

    return {
      chunks,
      strategy: 'semantic',
      totalChunks: chunks.length,
    }
  },
}
```

**Step 5: Barrel export + 跑測試**

**Step 6: Commit**

```bash
git commit -m "feat: 實作 Pipeline Chunkers (fixed-size, semantic)"
```

---

### Task 13：實作 Indexer 節點

**Files:**
- Create: `src/lib/pipeline/indexers/supabase-indexer.ts`

**說明：** 將分塊後的內容生成 embedding 並寫入 Supabase pgvector。

**Step 1: 寫失敗測試**

**Step 2: 跑測試確認失敗**

**Step 3: 實作（包裝現有 embed + insert 邏輯）**

```typescript
// src/lib/pipeline/indexers/supabase-indexer.ts
import type { PipelineNode, ChunkedContent, PipelineResult } from '../types'
import { embed } from 'ai'
import { getEmbeddingModel } from '@/lib/ai/providers'
import { EMBEDDING_PROVIDER_OPTIONS } from '@/lib/ai/providers'

interface IndexerInput {
  readonly chunkedContent: ChunkedContent
  readonly documentId: string
  readonly userId: string
  readonly supabase: any // SupabaseClient type
}

export const supabaseIndexer: PipelineNode<IndexerInput, PipelineResult> = {
  id: 'supabase-indexer',
  type: 'indexer',
  name: 'Supabase 向量索引器',
  async execute(input): Promise<PipelineResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let indexed = 0

    for (const chunk of input.chunkedContent.chunks) {
      try {
        const { embedding } = await embed({
          model: getEmbeddingModel(),
          value: chunk.text,
          experimental_providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        })

        await input.supabase.from('document_embeddings').insert({
          document_id: input.documentId,
          chunk_text: chunk.text,
          embedding: JSON.stringify(embedding),
          chunk_index: chunk.index,
          metadata: chunk.metadata,
        })
        indexed++
      } catch (error) {
        errors.push(`Chunk ${chunk.index}: ${String(error)}`)
      }
    }

    return {
      documentId: input.documentId,
      chunksIndexed: indexed,
      qualitySignals: {
        completeness: indexed / input.chunkedContent.totalChunks,
        coherence: 1,
        duplicateRatio: 0,
        languageConfidence: 1,
      },
      processingTimeMs: Date.now() - startTime,
      errors,
    }
  },
}
```

**Step 4: 跑測試確認通過**

**Step 5: Commit**

```bash
git commit -m "feat: 實作 Supabase 向量索引器 (Pipeline Indexer)"
```

---

### Task 14：組合 Knowledge Pipeline 執行器

**Files:**
- Create: `src/lib/pipeline/pipeline-executor.ts`
- Create: `src/lib/pipeline/index.ts`

**Step 1: 寫失敗測試**

```typescript
// tests/lib/pipeline/pipeline-executor.test.ts
import { describe, it, expect } from '@jest/globals'

describe('Pipeline Executor', () => {
  it('應該能建立並執行 pipeline', async () => {
    const { createPipeline } = await import('@/lib/pipeline')
    const pipeline = createPipeline({
      source: 'file-upload',
      chunkStrategy: 'fixed-size',
    })
    expect(pipeline).toBeDefined()
    expect(pipeline.stages).toHaveLength(3) // extractor + chunker + indexer
  })
})
```

**Step 2: 跑測試確認失敗**

**Step 3: 實作 Pipeline Executor**

```typescript
// src/lib/pipeline/pipeline-executor.ts
import type { SourceType, ChunkStrategy, PipelineResult, ExtractedContent, ChunkedContent } from './types'
import { pdfExtractor, urlExtractor, rssExtractor } from './extractors'
import { fixedSizeChunker, semanticChunker } from './chunkers'
import { supabaseIndexer } from './indexers/supabase-indexer'

interface PipelineConfig {
  readonly source: SourceType
  readonly chunkStrategy: ChunkStrategy
}

interface PipelineStage {
  readonly id: string
  readonly type: string
}

export function createPipeline(config: PipelineConfig) {
  const extractor = getExtractor(config.source)
  const chunker = getChunker(config.chunkStrategy)

  return {
    stages: [
      { id: extractor.id, type: extractor.type },
      { id: chunker.id, type: chunker.type },
      { id: supabaseIndexer.id, type: supabaseIndexer.type },
    ] as ReadonlyArray<PipelineStage>,

    async execute(input: {
      data: any
      documentId: string
      userId: string
      supabase: any
    }): Promise<PipelineResult> {
      // Stage 1: Extract
      const extracted: ExtractedContent = await extractor.execute(input.data)

      // Stage 2: Chunk
      const chunked: ChunkedContent = await chunker.execute(extracted)

      // Stage 3: Index
      const result: PipelineResult = await supabaseIndexer.execute({
        chunkedContent: chunked,
        documentId: input.documentId,
        userId: input.userId,
        supabase: input.supabase,
      })

      return result
    },
  }
}

function getExtractor(source: SourceType) {
  switch (source) {
    case 'file-upload': return pdfExtractor
    case 'url': return urlExtractor
    case 'rss': return rssExtractor
    default: return urlExtractor
  }
}

function getChunker(strategy: ChunkStrategy) {
  switch (strategy) {
    case 'fixed-size': return fixedSizeChunker
    case 'semantic': return semanticChunker
    default: return fixedSizeChunker
  }
}
```

**Step 4: Barrel export**

```typescript
// src/lib/pipeline/index.ts
export { createPipeline } from './pipeline-executor'
export type * from './types'
```

**Step 5: 跑測試確認通過**

**Step 6: Commit**

```bash
git commit -m "feat: 組合 Knowledge Pipeline 執行器 (Source→Extract→Chunk→Index)"
```

---

### Task 15：替換 Knowledge Upload API

**Files:**
- Modify: `src/app/api/knowledge/upload/route.ts`
- Modify: `src/app/api/knowledge/url/route.ts`

**Step 1: 寫整合測試**

**Step 2: 修改 upload route 使用 Pipeline**

核心改動：
- 用 `createPipeline({ source: 'file-upload', chunkStrategy: 'semantic' }).execute()` 替換手動的 parse + embed + insert
- 加入 `USE_PIPELINE=true` feature flag
- 回傳 `PipelineResult`（含品質信號）

**Step 3: 修改 url route 使用 Pipeline**

類似改動，使用 `createPipeline({ source: 'url', ... })`

**Step 4: 跑測試**

**Step 5: Commit**

```bash
git commit -m "feat: Knowledge API 使用 Pipeline 架構 (feature flag)"
```

---

## Phase 3：整合測試與收尾

### Task 16：更新 Mastra 主實例（註冊所有 Agent + Workflow）

**Files:**
- Modify: `src/lib/mastra/index.ts`

**Step 1: 更新 Mastra 實例，註冊完整的 Agent 和 Workflow 清單**

```typescript
// src/lib/mastra/index.ts (最終版)
import { Mastra } from '@mastra/core'
import { deepResearchOrchestrator } from './agents/research-orchestrator'
import { questionDecomposerAgent } from './agents/question-decomposer'
import { parallelResearcherAgent } from './agents/parallel-researcher'
import { reportSynthesizerAgent } from './agents/report-synthesizer'
import { deepResearchWorkflow } from './workflows/deep-research-workflow'

export const mastra = new Mastra({
  agents: {
    'deep-research-orchestrator': deepResearchOrchestrator,
    'question-decomposer': questionDecomposerAgent,
    'parallel-researcher': parallelResearcherAgent,
    'report-synthesizer': reportSynthesizerAgent,
  },
  workflows: {
    'deep-research': deepResearchWorkflow,
  },
})
```

**Step 2: Commit**

```bash
git commit -m "feat: 更新 Mastra 主實例（註冊所有 Agent + Workflow）"
```

---

### Task 17：E2E 測試

**Files:**
- Create: `e2e/mastra-deep-research.spec.ts`
- Create: `e2e/knowledge-pipeline.spec.ts`

**Step 1: Deep Research E2E**

測試重點：
- 觸發深度研究 → 收到 SSE progress events → 收到完整報告
- Feature flag ON 時走 Mastra 路徑
- Feature flag OFF 時走 legacy 路徑

**Step 2: Knowledge Pipeline E2E**

測試重點：
- 上傳 PDF → Pipeline 執行 → 新文件出現在知識庫
- Pipeline Result 含品質信號
- Chunks 可被 RAG 檢索

**Step 3: 跑 E2E 測試**

```bash
npx playwright test e2e/mastra-deep-research.spec.ts e2e/knowledge-pipeline.spec.ts --project=chromium
```

**Step 4: Commit**

```bash
git commit -m "test: E2E 測試 Mastra Deep Research + Knowledge Pipeline"
```

---

### Task 18：文件更新與 Feature Flag 配置

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

**Step 1: 更新 env 範例**

```bash
# .env.local.example 新增
USE_MASTRA_RESEARCH=true    # 啟用 Mastra Deep Research Agent
USE_PIPELINE=true            # 啟用 Knowledge Pipeline 架構
```

**Step 2: 更新 README 架構說明**

**Step 3: 最終 Commit**

```bash
git add -A
git commit -m "docs: 更新 README 與環境變數說明 (Week 3+ 架構升級完成)"
```

---

## 風險評估

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| Mastra + Vercel AI SDK 版本衝突 | 高 | 使用 `--legacy-peer-deps`，固定版本 |
| Gemini API rate limit（並行研究） | 中 | 加入 concurrency limiter (p-limit) |
| 現有測試因重構破壞 | 中 | Feature flag 隔離，Legacy path 保留 |
| Pipeline 中間失敗 | 低 | 每階段獨立 error handling + 部分成功 |

## 驗收條件

- [ ] `npm run build` 通過
- [ ] `npm run test` 通過（覆蓋率 > 80%）
- [ ] Deep Research 可透過 Feature Flag 切換 Mastra/Legacy
- [ ] Knowledge Pipeline 可處理 PDF/URL/RSS 三種來源
- [ ] E2E 測試覆蓋核心流程
- [ ] 無硬編碼密鑰
