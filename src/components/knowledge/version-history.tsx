'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Loader2, RotateCcw, GitCompare, Clock } from 'lucide-react'

interface VersionSummary {
  id: string
  document_id: string
  version_number: number
  title: string
  summary: string | null
  change_description: string | null
  created_at: string
}

interface VersionDetail {
  id: string
  content: string
  title: string
  version_number: number
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  text: string
}

interface VersionHistoryProps {
  documentId: string
  isOpen: boolean
  onClose: () => void
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  const maxLen = Math.max(oldLines.length, newLines.length)
  let oi = 0
  let ni = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) {
      result.push({ type: 'added', text: newLines[ni] })
      ni++
    } else if (ni >= newLines.length) {
      result.push({ type: 'removed', text: oldLines[oi] })
      oi++
    } else if (oldLines[oi] === newLines[ni]) {
      result.push({ type: 'unchanged', text: oldLines[oi] })
      oi++
      ni++
    } else {
      // Simple heuristic: look ahead to find matching lines
      let foundInNew = -1
      for (let j = ni + 1; j < Math.min(ni + 5, newLines.length); j++) {
        if (oldLines[oi] === newLines[j]) {
          foundInNew = j
          break
        }
      }

      let foundInOld = -1
      for (let j = oi + 1; j < Math.min(oi + 5, oldLines.length); j++) {
        if (oldLines[j] === newLines[ni]) {
          foundInOld = j
          break
        }
      }

      if (foundInNew >= 0 && (foundInOld < 0 || foundInNew - ni <= foundInOld - oi)) {
        // Lines were added in new
        while (ni < foundInNew) {
          result.push({ type: 'added', text: newLines[ni] })
          ni++
        }
      } else if (foundInOld >= 0) {
        // Lines were removed from old
        while (oi < foundInOld) {
          result.push({ type: 'removed', text: oldLines[oi] })
          oi++
        }
      } else {
        result.push({ type: 'removed', text: oldLines[oi] })
        result.push({ type: 'added', text: newLines[ni] })
        oi++
        ni++
      }
    }

    if (result.length > maxLen * 3) break // Safety guard
  }

  return result
}

export function VersionHistory({ documentId, isOpen, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersions, setSelectedVersions] = useState<string[]>([])
  const [diffData, setDiffData] = useState<{ left: VersionDetail; right: VersionDetail } | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/knowledge/${documentId}/versions`)
      if (res.ok) {
        const { data } = await res.json()
        setVersions(data ?? [])
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    if (isOpen && documentId) {
      loadVersions()
      setSelectedVersions([])
      setDiffData(null)
    }
  }, [isOpen, documentId, loadVersions])

  const toggleVersion = useCallback((versionId: string) => {
    setSelectedVersions((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((v) => v !== versionId)
      }
      if (prev.length >= 2) {
        return [prev[1], versionId]
      }
      return [...prev, versionId]
    })
  }, [])

  const loadDiff = useCallback(async () => {
    if (selectedVersions.length !== 2) return
    setLoadingDiff(true)
    try {
      const [leftRes, rightRes] = await Promise.all([
        fetch(`/api/knowledge/${documentId}/versions/${selectedVersions[0]}`),
        fetch(`/api/knowledge/${documentId}/versions/${selectedVersions[1]}`),
      ])

      if (leftRes.ok && rightRes.ok) {
        const { data: left } = await leftRes.json()
        const { data: right } = await rightRes.json()

        // Ensure left is the older version
        if (left.version_number > right.version_number) {
          setDiffData({ left: right, right: left })
        } else {
          setDiffData({ left, right })
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingDiff(false)
    }
  }, [documentId, selectedVersions])

  const diffLines = useMemo(() => {
    if (!diffData) return []
    return computeDiff(diffData.left.content, diffData.right.content)
  }, [diffData])

  const handleRestore = useCallback(async (versionId: string) => {
    if (restoring) return
    setRestoring(true)
    try {
      const res = await fetch(`/api/knowledge/${documentId}/versions/${versionId}/restore`, {
        method: 'POST',
      })
      if (res.ok) {
        onClose()
        // Trigger page refresh
        window.dispatchEvent(new CustomEvent('knowledge-updated'))
      }
    } catch {
      // Silent fail
    } finally {
      setRestoring(false)
    }
  }, [documentId, restoring, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-foreground">版本歷史</h3>
            <span className="text-xs text-gray-400">
              {versions.length} 個版本
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Version list */}
          <div className="w-72 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-3 flex-shrink-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                尚無版本紀錄
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-2">
                  選擇兩個版本以對比差異
                </p>
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => toggleVersion(v.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedVersions.includes(v.id)
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">
                        v{v.version_number}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(v.created_at).toLocaleString('zh-TW', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {v.change_description && (
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {v.change_description}
                      </p>
                    )}
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRestore(v.id)
                        }}
                        disabled={restoring}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        還原
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Diff view */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedVersions.length === 2 && !diffData ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <button
                  onClick={loadDiff}
                  disabled={loadingDiff}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {loadingDiff ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GitCompare className="w-4 h-4" />
                  )}
                  比較差異
                </button>
              </div>
            ) : diffData ? (
              <div>
                <div className="flex items-center gap-4 mb-4 text-sm">
                  <span className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 rounded">
                    v{diffData.left.version_number}: {diffData.left.title}
                  </span>
                  <span className="text-gray-400">vs</span>
                  <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 rounded">
                    v{diffData.right.version_number}: {diffData.right.title}
                  </span>
                </div>
                <div className="font-mono text-xs border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-0.5 border-b border-gray-100 dark:border-gray-800 ${
                        line.type === 'added'
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                          : line.type === 'removed'
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span className="select-none mr-2 text-gray-400">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      {line.text || '\u00A0'}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <GitCompare className="w-12 h-12 mb-3" />
                <p className="text-sm">選擇兩個版本以檢視差異</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
