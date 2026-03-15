'use client'

import { useState, useEffect } from 'react'
import { Search, FileText, AtSign, Loader2, X } from 'lucide-react'
import type { Document } from '@/types'

interface KnowledgePanelProps {
  onCitation?: (doc: Document) => void
}

export function KnowledgePanel({ onCitation }: KnowledgePanelProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    try {
      const res = await fetch('/api/knowledge')
      if (res.ok) {
        const { data } = await res.json()
        setDocuments(data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  function handleCitation(doc: Document) {
    if (onCitation) {
      onCitation(doc)
    }
  }

  const filteredDocuments = searchQuery
    ? documents.filter((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : documents

  const enabledDocuments = filteredDocuments.filter((d) => d.enabled)

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-foreground mb-3">知識庫</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋知識庫..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : enabledDocuments.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>
              {searchQuery
                ? '未找到相關文件'
                : '尚無啟用的文件'}
            </p>
          </div>
        ) : (
          enabledDocuments.map((doc) => (
            <div
              key={doc.id}
              className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-foreground truncate">
                    {doc.title}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {doc.summary || '暫無摘要'}
                  </p>
                </div>
                <button
                  onClick={() => handleCitation(doc)}
                  className="flex-shrink-0 p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title="插入引用"
                >
                  <AtSign className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
