'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Search, FileText, Scale, Radio, GitBranch } from 'lucide-react'

export interface RAGMetadata {
  originalQuery: string
  finalQuery: string
  rewrites: number
  relevanceScore: number
  relevanceVerdict: string
  retrievalMethod: 'local' | 'web' | 'hybrid'
  documents: Array<{ title: string; similarity: number; sourceType?: '內部' | '外部' | '未知' }>
  hasGraphContext?: boolean
}

interface RAGTransparencyPanelProps {
  metadata: RAGMetadata
  isOpen: boolean
  onToggle: () => void
}

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 80
      ? 'bg-green-500'
      : pct >= 60
      ? 'bg-yellow-500'
      : 'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

const METHOD_LABELS: Record<string, { label: string; color: string }> = {
  local: { label: '本地知識庫', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  web: { label: '網路搜尋', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
  hybrid: { label: '混合檢索', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
}

export function RAGTransparencyPanel({ metadata, isOpen, onToggle }: RAGTransparencyPanelProps) {
  const method = METHOD_LABELS[metadata.retrievalMethod] ?? METHOD_LABELS.local
  const hasRewrite = metadata.originalQuery !== metadata.finalQuery

  return (
    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" />
          RAG 檢索資訊
          {metadata.documents.length > 0 && (
            <span className="text-[10px] text-gray-400">
              ({metadata.documents.length} 篇文件)
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800">
          {/* 查詢重寫 */}
          {hasRewrite && (
            <div className="pt-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Search className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] font-medium text-gray-500">查詢重寫</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <span className="line-through text-gray-400">{metadata.originalQuery}</span>
                <span className="text-gray-400">&rarr;</span>
                <span className="font-medium">{metadata.finalQuery}</span>
              </div>
            </div>
          )}

          {/* 命中文件 */}
          {metadata.documents.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3 h-3 text-green-500" />
                <span className="text-[10px] font-medium text-gray-500">命中文件</span>
              </div>
              <div className="space-y-1.5">
                {metadata.documents.map((doc, idx) => (
                  <div key={idx}>
                    <p className="text-xs text-foreground truncate mb-0.5">{doc.title}</p>
                    <SimilarityBar value={doc.similarity} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 評分結果 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Scale className="w-3 h-3 text-orange-500" />
              <span className="text-[10px] font-medium text-gray-500">評分結果</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground font-medium">
                {Math.round(metadata.relevanceScore * 100)}%
              </span>
              <span className="text-gray-400">{metadata.relevanceVerdict}</span>
            </div>
          </div>

          {/* 檢索方式 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Radio className="w-3 h-3 text-purple-500" />
              <span className="text-[10px] font-medium text-gray-500">檢索方式</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${method.color}`}>
                {method.label}
              </span>
              {metadata.hasGraphContext && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-teal-600 bg-teal-50 dark:bg-teal-900/20">
                  <GitBranch className="w-2.5 h-2.5" />
                  知識圖譜增強
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
