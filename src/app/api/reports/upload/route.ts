import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectFileType, parseFile, parseFileWithMarker, MAX_FILE_SIZE } from '@/lib/parsers/file-parser'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 解析 multipart form data
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const useMarker = formData.get('useMarker') === 'true'

  if (!file) {
    return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '檔案大小不得超過 10MB' }, { status: 400 })
  }

  // 偵測檔案類型
  const fileType = detectFileType(file.type, file.name)
  if (!fileType) {
    return NextResponse.json(
      { error: '不支援的檔案格式。支援：PDF、Word、Excel、PowerPoint、TXT、Markdown、PNG、JPG' },
      { status: 400 }
    )
  }

  // 解析檔案內容
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let text: string
  let parsedBy: 'marker' | 'builtin' = 'builtin'
  try {
    const parsedDoc = useMarker
      ? await parseFileWithMarker(buffer, fileType, file.name)
      : await parseFile(buffer, fileType)
    text = parsedDoc.text
    parsedBy = parsedDoc.parsedBy ?? 'builtin'

    // 圖片檔案需要視覺分析
    const isImageFile = fileType === 'png' || fileType === 'jpeg' || fileType === 'jpg'

    if (parsedBy === 'builtin' && ((fileType === 'pdf' && parsedDoc.pages.length > 0) || isImageFile)) {
      const { analyzeImage } = await import('@/lib/ai/vision-analyzer')

      const CONCURRENCY_LIMIT = 3
      const pages = parsedDoc.pages

      for (let i = 0; i < pages.length; i += CONCURRENCY_LIMIT) {
        const chunk = pages.slice(i, i + CONCURRENCY_LIMIT)
        await Promise.all(chunk.map(async (page) => {
          if (page.image) {
            const description = await analyzeImage(page.image)
            if (description && description.length > 10) {
              const visualBlock = `\n\n【第 ${page.pageNumber} 頁視覺分析】：\n${description}\n`
              page.text += visualBlock
            }
          }
        }))
      }

      // 重新組合 Full Text
      text = parsedDoc.pages.map(p => p.text).join('\n\n')
    }
  } catch (parseError) {
    const detail = parseError instanceof Error ? parseError.message : String(parseError)
    console.error(`[ReportUpload] 檔案解析失敗: type=${fileType}, name=${file.name}, size=${file.size}`)
    console.error('[ReportUpload Error Detail]:', parseError)
    return NextResponse.json(
      { error: `檔案解析失敗：${detail}` },
      { status: 400 }
    )
  }

  if (!text.trim()) {
    return NextResponse.json({ error: '無法從檔案中提取文字內容' }, { status: 400 })
  }

  // 從檔名生成標題（去掉副檔名）
  const title = file.name.replace(/\.[^.]+$/, '')

  // 產生 plain_text（去除 Markdown 語法）
  const plainText = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_~|-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  // 取前 150 字作為摘要
  const summary = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

  // 建構 tags
  const tags = ['UPLOAD', fileType.toUpperCase()]
  if (parsedBy === 'marker') tags.push('MARKER')

  // 存入 reports 表
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
      originalName: file.name,
      fileType,
      textLength: text.length,
      parsedBy,
    },
  })
}
