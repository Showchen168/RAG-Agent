import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractAssistantContent, generateDocxBuffer } from '@/lib/export/document-export'

export const runtime = 'nodejs'

/** 安全性：清理 HTML 中的危險標籤，防止 XSS */
function sanitizeHtmlForExport(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[^>]*>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { html, markdown, title, format } = await req.json() as {
    html?: string
    markdown?: string
    title: string
    format?: 'docx' | 'pdf'
  }

  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 })
  }

  if (format === 'pdf') {
    // PDF：使用 Playwright 渲染 HTML
    if (!html) {
      return NextResponse.json({ error: 'Missing html for PDF export' }, { status: 400 })
    }
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    try {
      const page = await browser.newPage()
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #333; }
    h1 { font-size: 24px; margin-bottom: 16px; }
    h2 { font-size: 20px; margin-bottom: 12px; }
    h3 { font-size: 16px; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #f3f4f6; font-weight: 600; }
    blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #666; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  </style>
</head>
<body>${sanitizeHtmlForExport(html)}</body>
</html>`
      await page.setContent(fullHtml, { waitUntil: 'load' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '14mm', bottom: '20mm', left: '14mm' },
      })
      return new Response(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.pdf"`,
        },
      })
    } finally {
      await browser.close()
    }
  }

  // DOCX：使用 Markdown → ExportBlock → docx 路徑
  // 複用 document-export.ts 已有的成熟 Markdown 解析與 docx 生成邏輯
  const content = markdown || html || ''
  if (!content) {
    return NextResponse.json({ error: 'Missing markdown or html' }, { status: 400 })
  }

  const blocks = extractAssistantContent(content)
  const buffer = await generateDocxBuffer(title, blocks)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.docx"`,
    },
  })
}
