'use client'

import { useState } from 'react'
import { Sparkles, Search, Pencil, Loader2, Wand2 } from 'lucide-react'
import type { DiagramType } from '@/lib/ai/diagram-generator'

type TabId = 'generate' | 'analyze' | 'modify'

interface DiagramAiPanelProps {
  onApplyXml: (xml: string) => void
  onGetCurrentXml: () => string | undefined
}

const TABS: { id: TabId; label: string; icon: typeof Sparkles }[] = [
  { id: 'generate', label: '生成', icon: Sparkles },
  { id: 'analyze', label: '分析', icon: Search },
  { id: 'modify', label: '修改', icon: Pencil },
]

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'flowchart', label: '流程圖' },
  { value: 'sequence', label: '時序圖' },
  { value: 'mindmap', label: '心智圖' },
  { value: 'er', label: 'ER 圖' },
  { value: 'class', label: '類別圖' },
  { value: 'state', label: '狀態圖' },
  { value: 'architecture', label: '架構圖' },
  { value: 'general', label: '一般' },
]

export function DiagramAiPanel({ onApplyXml, onGetCurrentXml }: DiagramAiPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('generate')
  const [prompt, setPrompt] = useState('')
  const [diagramType, setDiagramType] = useState<DiagramType>('flowchart')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{
    description: string
    suggestions: string[]
    diagramType: string
    structure: { nodeCount: number; edgeCount: number }
  } | null>(null)

  const handleSubmit = async () => {
    if (loading) return
    setError(null)
    setLoading(true)

    try {
      const currentXml = onGetCurrentXml()

      const body: Record<string, unknown> = { action: activeTab }

      if (activeTab === 'generate') {
        body.prompt = prompt
        body.diagramType = diagramType
      } else if (activeTab === 'analyze') {
        body.xml = currentXml
      } else if (activeTab === 'modify') {
        body.prompt = prompt
        body.xml = currentXml
      }

      const res = await fetch('/api/canvas/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '操作失敗')
      }

      const data = await res.json()

      if (activeTab === 'analyze') {
        setAnalysisResult(data)
      } else {
        onApplyXml(data.xml)
        setPrompt('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-gray-200 dark:border-gray-700 w-72 bg-white dark:bg-gray-900">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setError(null); setAnalysisResult(null) }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors ${
              activeTab === id
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Generate tab */}
        {activeTab === 'generate' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {DIAGRAM_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDiagramType(value)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    diagramType === value
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要的圖表..."
              className="w-full h-24 p-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </>
        )}

        {/* Analyze tab */}
        {activeTab === 'analyze' && analysisResult && (
          <div className="space-y-2">
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">圖表描述</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{analysisResult.description}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">結構</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {analysisResult.structure.nodeCount} 個節點 · {analysisResult.structure.edgeCount} 條連線 · {analysisResult.diagramType}
              </p>
            </div>
            {analysisResult.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-1">改進建議</h4>
                <ul className="space-y-1">
                  {analysisResult.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1">
                      <span className="text-blue-500">&#x2022;</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Modify tab */}
        {activeTab === 'modify' && (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述要如何修改目前的圖表..."
            className="w-full h-24 p-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>

      {/* Action button */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSubmit}
          disabled={loading || (activeTab !== 'analyze' && !prompt.trim())}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 rounded-lg transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 處理中...</>
          ) : (
            <><Wand2 className="w-4 h-4" /> {activeTab === 'analyze' ? '分析圖表' : activeTab === 'modify' ? '修改圖表' : '生成圖表'}</>
          )}
        </button>
      </div>
    </div>
  )
}
