import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken } from '@/lib/gdrive/tokens'
import { downloadFile, exportFile } from '@/lib/gdrive/client'
import { parseFileWithMarker, detectFileType } from '@/lib/parsers/file-parser'
import type { SupportedFileType } from '@/lib/parsers/file-parser'

/**
 * POST /api/reports/gdrive-import
 *
 * 使用 Google Drive API SDK 下載檔案，解析後存入 reports 表
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { fileId, fileName, mimeType } = (await req.json()) as {
      fileId: string
      fileName: string
      mimeType?: string
    }

    if (!fileId || !fileName) {
      return NextResponse.json(
        { error: 'fileId 和 fileName 為必填欄位' },
        { status: 400 }
      )
    }

    // 取得用戶的有效 token
    const token = await getValidToken(user.id)
    if (!token) {
      return NextResponse.json(
        { error: 'Google Drive 未連接，請先授權' },
        { status: 403 }
      )
    }

    // 判斷是否為 Google 原生檔案（需要匯出轉換）
    const exportMimeType = getGoogleExportMimeType(mimeType)
    const isGoogleNative = !!exportMimeType

    // Step 1: 下載檔案
    let buffer: Buffer

    try {
      if (isGoogleNative) {
        // Google 原生檔案 → 匯出
        buffer = await exportFile(user.id, fileId, exportMimeType)
      } else {
        // 一般檔案 → 直接下載
        buffer = await downloadFile(user.id, fileId)
      }
    } catch (downloadError) {
      const detail = downloadError instanceof Error ? downloadError.message : 'Unknown'

      if (detail.includes('PERMISSION_DENIED') || detail.includes('insufficient')) {
        return NextResponse.json(
          { error: 'Google Drive 權限不足，請斷開連接後重新授權' },
          { status: 403 }
        )
      }

      if (detail.includes('Not Found')) {
        return NextResponse.json(
          { error: '檔案不存在或已被刪除' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: `無法下載檔案：${detail}` },
        { status: 500 }
      )
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { error: '檔案為空或下載失敗' },
        { status: 400 }
      )
    }

    // Step 2: 偵測檔案類型並解析
    let text: string
    const parseFileType: SupportedFileType | null = isGoogleNative
      ? getGoogleParseType(mimeType)
      : detectFileType('', fileName)
    const fileType = isGoogleNative
      ? (getGoogleNativeLabel(mimeType) ?? parseFileType?.toUpperCase() ?? 'UNKNOWN')
      : parseFileType?.toUpperCase() ?? 'UNKNOWN'
    let parsedBy: 'marker' | 'builtin' = 'builtin'

    const parseFileName = isGoogleNative
      ? getGoogleExportFileName(fileName, mimeType)
      : fileName

    if (!parseFileType) {
      return NextResponse.json(
        { error: '不支援的檔案格式。支援：PDF、Word、PowerPoint、Excel、TXT、Markdown、Google Docs/Sheets/Slides' },
        { status: 400 }
      )
    }

    try {
      const parsedDoc = await parseFileWithMarker(buffer, parseFileType, parseFileName)
      text = parsedDoc.text
      parsedBy = parsedDoc.parsedBy ?? 'builtin'
    } catch (parseError) {
      const detail = parseError instanceof Error ? parseError.message : String(parseError)
      return NextResponse.json(
        { error: `檔案解析失敗：${detail}` },
        { status: 400 }
      )
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: '無法從檔案中提取文字內容' },
        { status: 400 }
      )
    }

    // Step 4: 存入 reports 表
    const title = fileName.replace(/\.[^.]+$/, '')

    const plainText = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*`_~|-]/g, ' ')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()

    const summary = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

    const tags = ['GDRIVE', fileType]
    if (parsedBy === 'marker') tags.push('MARKER')

    const { data, error } = await supabase
      .from('reports')
      .insert({
        user_id: user.id,
        title,
        markdown_content: text,
        plain_text: plainText,
        summary,
        tags,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        originalName: fileName,
        fileType,
        textLength: text.length,
        parsedBy,
        source: 'Google Drive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Google Drive 匯入失敗：${message}` },
      { status: 500 }
    )
  }
}

// === Helper Functions (Google MIME Type Conversion) ===

function getGoogleExportMimeType(mimeType?: string): string | null {
  if (!mimeType) return null
  const mapping: Record<string, string> = {
    'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return mapping[mimeType] ?? null
}

function getGoogleParseType(mimeType?: string): SupportedFileType | null {
  if (!mimeType) return null
  const mapping: Record<string, SupportedFileType> = {
    'application/vnd.google-apps.document': 'docx',
    'application/vnd.google-apps.spreadsheet': 'xlsx',
    'application/vnd.google-apps.presentation': 'pptx',
  }
  return mapping[mimeType] ?? null
}

function getGoogleExportFileName(originalName: string, mimeType?: string): string {
  if (!mimeType) return originalName
  const extMapping: Record<string, string> = {
    'application/vnd.google-apps.document': '.docx',
    'application/vnd.google-apps.spreadsheet': '.xlsx',
    'application/vnd.google-apps.presentation': '.pptx',
  }
  const ext = extMapping[mimeType]
  if (!ext) return originalName
  const baseName = originalName.replace(/\.[^.]+$/, '')
  return `${baseName}${ext}`
}

function getGoogleNativeLabel(mimeType?: string): string | null {
  if (!mimeType) return null
  const mapping: Record<string, string> = {
    'application/vnd.google-apps.document': 'GOOGLE_DOC',
    'application/vnd.google-apps.spreadsheet': 'GOOGLE_SHEET',
    'application/vnd.google-apps.presentation': 'GOOGLE_SLIDE',
  }
  return mapping[mimeType] ?? null
}
