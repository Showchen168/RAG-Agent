'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { MarkdownRenderer as MarkDownRenderer } from '@/components/chat/markdown-renderer'

interface DocumentViewerProps {
    isOpen: boolean
    onClose: () => void
    initialTitle?: string
    initialDocId?: string
    initialPage?: number
    onDocumentLoaded?: (title: string) => void
}

interface PageData {
    pageNumber: number
    content: string
}

export function DocumentViewer({ isOpen, onClose, initialTitle, initialDocId, initialPage, onDocumentLoaded }: DocumentViewerProps) {
    const [title, setTitle] = useState(initialTitle || '')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pages, setPages] = useState<PageData[]>([])
    const [currentPage, setCurrentPage] = useState(initialPage || 1)
    const [totalDocsFound, setTotalDocsFound] = useState(0)

    const supabase = createClient()
    const contentRef = useRef<HTMLDivElement>(null)

    // Track whether we've already fetched for this docId to prevent infinite loops
    const lastFetchedDocIdRef = useRef<string | undefined>(undefined)
    const lastFetchedTitleRef = useRef<string | undefined>(undefined)

    // Reset state when opening with new props
    useEffect(() => {
        if (initialDocId) {
            // Only fetch if docId actually changed (prevents re-fetch loop from parent re-render)
            if (lastFetchedDocIdRef.current !== initialDocId) {
                lastFetchedDocIdRef.current = initialDocId
                fetchDocument(undefined, initialDocId)
            }
        } else if (isOpen && initialTitle) {
            if (lastFetchedTitleRef.current !== initialTitle) {
                lastFetchedTitleRef.current = initialTitle
                setTitle(initialTitle)
                fetchDocument(initialTitle)
            }
        }
    }, [isOpen, initialTitle, initialDocId])

    // Scroll to top when page changes
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = 0
        }
    }, [currentPage])

    const fetchDocument = async (searchTitle?: string, searchId?: string) => {
        setIsLoading(true)
        setError(null)
        setPages([])

        try {
            let query = supabase
                .from('documents')
                .select('content, title')

            if (searchId) {
                query = query.eq('id', searchId)
            } else if (searchTitle) {
                query = query.ilike('title', `%${searchTitle}%`)
            } else {
                throw new Error('No search criteria provided')
            }

            const { data, error } = await query.limit(1)

            if (error) throw error

            if (!data || data.length === 0) {
                setError('找不到符合的文件')
                setTotalDocsFound(0)
            } else {
                const doc = data[0]
                setTotalDocsFound(1) // Simplified
                setTitle(doc.title) // Set actual title
                if (onDocumentLoaded) {
                    onDocumentLoaded(doc.title)
                }
                parseContent(doc.content)
            }
        } catch (err) {
            console.error('Error fetching document:', err)
            setError('無法載入文件內容')
        } finally {
            setIsLoading(false)
        }
    }

    const parseContent = (text: string) => {
        // Parse [[PAGE_N]] markers
        const parts = text.split(/\[\[PAGE_(\d+)\]\]/g)

        // If no markers found, treat as single page
        if (parts.length === 1) {
            setPages([{ pageNumber: 1, content: text }])
            setCurrentPage(1)
            return
        }

        const parsedPages: PageData[] = []

        // split results: [pre-text, pageNum1, content1, pageNum2, content2, ...]
        // usually pre-text is empty or handled

        for (let i = 1; i < parts.length; i += 2) {
            const pageNum = parseInt(parts[i], 10)
            const content = parts[i + 1]
            if (!isNaN(pageNum) && content) {
                parsedPages.push({ pageNumber: pageNum, content: content.trim() })
            }
        }

        if (parsedPages.length === 0) {
            // Fallback
            setPages([{ pageNumber: 1, content: text }])
        } else {
            setPages(parsedPages.sort((a, b) => a.pageNumber - b.pageNumber))
        }

        // Set initial page if valid, otherwise 1
        if (initialPage && parsedPages.some(p => p.pageNumber === initialPage)) {
            setCurrentPage(initialPage)
        } else {
            setCurrentPage(1)
        }
    }

    if (!isOpen) return null

    const currentPageData = pages.find(p => p.pageNumber === currentPage)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
            <div className="bg-white dark:bg-gray-900 w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                            <Search className="w-4 h-4" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {title || '文件檢視器'}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                            <p className="text-lg font-medium mb-2">無法顯示文件</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : (
                        <div
                            ref={contentRef}
                            className="h-full overflow-y-auto p-6 sm:p-8 bg-white dark:bg-gray-900 scroll-smooth"
                        >
                            {currentPageData ? (
                                <div className="max-w-none prose prose-slate dark:prose-invert">
                                    <MarkDownRenderer textMarkdown={currentPageData.content} />
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 py-10">
                                    無頁面內容
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer / Pagination */}
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        {pages.length > 0 ? `第 ${currentPage} 頁，共 ${pages.length} 頁` : ''}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1 || pages.length === 0}
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>

                        <span className="text-sm font-medium w-8 text-center">
                            {currentPage}
                        </span>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
                            disabled={currentPage >= pages.length || pages.length === 0}
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
