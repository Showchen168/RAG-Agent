'use client'

import { useEffect, useRef, useState, useId } from 'react'
import mermaid from 'mermaid'

interface MermaidBlockProps {
  code: string
}

let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  const isDark = typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
  })
  mermaidInitialized = true
}

// Global SVG cache: prevents flashing when component remounts
// (e.g. when suggestions/memory load and parent re-renders)
const svgCache = new Map<string, string>()

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Initialize from cache if available — instant render, zero flash
  const [svg, setSvg] = useState<string | null>(() => svgCache.get(code) ?? null)
  const [error, setError] = useState(false)
  const uniqueId = useId().replace(/:/g, '_')
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCodeRef = useRef(code)
  const renderCountRef = useRef(0)
  const hasRenderedRef = useRef(svg !== null)

  // Debounce: only render after code stops changing for 500ms
  useEffect(() => {
    lastCodeRef.current = code

    // If we already have a cached SVG for this exact code, use it immediately
    const cached = svgCache.get(code)
    if (cached) {
      setSvg(cached)
      hasRenderedRef.current = true
      return
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      renderMermaid()
    }, 150)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [code])

  async function renderMermaid() {
    const currentRender = ++renderCountRef.current
    const codeToRender = lastCodeRef.current

    try {
      initMermaid()
      const { svg: renderedSvg } = await mermaid.render(
        `mermaid-${uniqueId}-${currentRender}`,
        codeToRender,
      )
      // Only update if this is still the latest render
      if (currentRender === renderCountRef.current) {
        svgCache.set(codeToRender, renderedSvg)
        setSvg(renderedSvg)
        setError(false)
        hasRenderedRef.current = true
      }
    } catch {
      if (currentRender === renderCountRef.current) {
        setError(true)
        setSvg(null)
      }
    }
  }

  if (error) {
    return (
      <div data-testid="mermaid-block">
        <pre className="bg-muted rounded-lg p-4 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  // Show SVG if we have one (from cache or freshly rendered)
  if (svg) {
    return (
      <div
        data-testid="mermaid-block"
        ref={containerRef}
        className="my-4 overflow-x-auto [&>svg]:max-w-full [&>svg]:max-h-[800px] [&>svg]:w-auto [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  // Loading state — only shown on first render before any SVG exists
  return (
    <div data-testid="mermaid-block" className="my-4 flex justify-center">
      <div className="animate-pulse bg-muted rounded-lg w-full h-32 flex items-center justify-center text-muted-foreground text-sm">
        圖表渲染中...
      </div>
    </div>
  )
}
