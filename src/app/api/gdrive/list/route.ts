import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken } from '@/lib/gdrive/tokens'
import { listFiles } from '@/lib/gdrive/client'

// MIME type 白名單（可導入的文件類型）
const IMPORTABLE_MIME_TYPES = new Set([
  // PDF
  'application/pdf',
  // Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  // Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // 純文字 / Markdown
  'text/plain',
  'text/markdown',
  // Google Docs
  'application/vnd.google-apps.document',
  // Google Sheets
  'application/vnd.google-apps.spreadsheet',
  // Google Slides
  'application/vnd.google-apps.presentation',
])

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * GET /api/gdrive/list
 *
 * 列出 Google Drive 檔案
 * 支援分頁、搜尋、資料夾瀏覽
 *
 * Query params:
 * - query: 搜尋關鍵字
 * - pageToken: 分頁 token（取自上一頁的 nextPageToken）
 * - folderId: 指定要列出的資料夾 ID（預設為根資料夾）
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('query') || ''
    const pageToken = searchParams.get('pageToken') || undefined
    const folderId = searchParams.get('folderId') || 'root'

    // 取得用戶的有效 token
    const token = await getValidToken(user.id)

    if (!token) {
      return NextResponse.json(
        { error: 'Google Drive 未連接，請先授權' },
        { status: 403 }
      )
    }

    // 呼叫 SDK listFiles
    const result = await listFiles(user.id, {
      pageToken,
      pageSize: 100,
      folderId: folderId === 'root' ? undefined : folderId,
      searchQuery: query || undefined,
      // Filter for importable types + folders
      mimeTypeFilter: Array.from(IMPORTABLE_MIME_TYPES),
    })

    // 轉換回傳格式
    const files = result.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      // 額外欄位
      size: file.size,
      isFolder: file.mimeType === FOLDER_MIME,
    }))

    return NextResponse.json({
      success: true,
      data: {
        files,
        nextPageToken: result.nextPageToken || undefined,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[/api/gdrive/list] Error: ${message}`)

    if (message.includes('PERMISSION_DENIED') || message.includes('insufficient')) {
      return NextResponse.json(
        { error: 'Google Drive 權限不足，請斷開連接後重新授權' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: `列出檔案失敗：${message}` },
      { status: 500 }
    )
  }
}
