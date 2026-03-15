import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken } from '@/lib/gdrive/tokens'
import { downloadFile, exportFile, getFileMetadata } from '@/lib/gdrive/client'
import { detectFileType, parseFileWithMarker } from '@/lib/parsers/file-parser'
import type { SupportedFileType } from '@/lib/parsers/file-parser'

/**
 * POST /api/gdrive/import
 *
 * 從 Google Drive 匯入檔案到知識庫
 * - 下載檔案
 * - 解析文件內容（PDF、Word、PPT 等）
 * - 儲存到 marker（知識庫表）
 *
 * Body:
 * {
 *   fileId: string,           // Google Drive 檔案 ID
 *   fileName: string,         // 檔案名稱
 *   mimeType: string,         // MIME type
 * }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { fileId, fileName, mimeType } = await req.json()

    if (!fileId || !fileName || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileId, fileName, mimeType' },
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

    // 取得檔案 metadata（確認檔案存在）
    await getFileMetadata(user.id, fileId)

    // 下載檔案
    let fileBuffer: Buffer
    let usedPdfFallback = false

    if (mimeType.includes('google-apps')) {
      // Google 原生檔案（Docs/Sheets/Slides）→ 匯出為對應 Office 格式
      const exportFormatMap: Record<string, string> = {
        'application/vnd.google-apps.document':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.google-apps.spreadsheet':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.google-apps.presentation':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }
      const exportFormat = exportFormatMap[mimeType] || 'application/pdf'

      try {
        fileBuffer = await exportFile(user.id, fileId, exportFormat)
      } catch {
        // Office 格式匯出失敗（例如權限不足）→ 降級為 PDF
        fileBuffer = await exportFile(user.id, fileId, 'application/pdf')
        usedPdfFallback = true
      }
    } else {
      // 一般檔案 → 直接下載
      fileBuffer = await downloadFile(user.id, fileId)
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json(
        { error: '檔案下載失敗或檔案為空' },
        { status: 400 }
      )
    }

    // 決定解析格式：PDF 降級時用 pdf，否則用 Office 格式
    const parseFileType: SupportedFileType | null = usedPdfFallback
      ? 'pdf'
      : mimeType.includes('google-apps')
        ? getGoogleParseType(mimeType)
        : detectFileType(mimeType, fileName)

    if (!parseFileType) {
      return NextResponse.json(
        { error: '不支援的檔案格式。支援：PDF、Word、PowerPoint、Excel、TXT、Markdown、Google Docs/Sheets/Slides' },
        { status: 400 }
      )
    }

    const parseFileName = usedPdfFallback
      ? fileName.replace(/\.[^.]+$/, '') + '.pdf'
      : mimeType.includes('google-apps')
        ? getGoogleExportFileName(fileName, mimeType)
        : fileName

    let text: string
    let parsedBy: 'marker' | 'builtin' = 'builtin'
    try {
      const parsedDoc = await parseFileWithMarker(fileBuffer, parseFileType, parseFileName)
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

    const title = fileName.replace(/\.[^.]+$/, '')
    const tags = [parseFileType.toUpperCase(), 'GDRIVE']
    if (parsedBy === 'marker') tags.push('MARKER')

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title,
        content: text,
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
        fileType: parseFileType,
        textLength: text.length,
        parsedBy,
        source: 'Google Drive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[/api/gdrive/import] Error: ${message}`)

    if (message.includes('PERMISSION_DENIED') || message.includes('insufficient')) {
      return NextResponse.json(
        { error: 'Google Drive 權限不足' },
        { status: 403 }
      )
    }

    if (message.includes('Not Found')) {
      return NextResponse.json(
        { error: '檔案不存在或已被刪除' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: `匯入失敗：${message}` },
      { status: 500 }
    )
  }
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
