/**
 * Skills Attachment Download Handler - Pure Function
 * GET /api/skills/attachments/[id] 的核心邏輯
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createRawClient } from "@supabase/supabase-js";
import type { SkillAttachment } from '@/types/skills'

interface ApiResult {
  readonly status: number
  readonly body: Record<string, unknown>
}

/** 取得 admin client（繞過 RLS） */
function getAdminClient(supabase: SupabaseClient): SupabaseClient {
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return createRawClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return supabase;
}

/**
 * GET /api/skills/attachments/{id} 的純函式處理器
 * @param supabase - Supabase client（已認證）
 * @param attachmentId - 附件 ID
 * @returns API 回應（附件 metadata 或錯誤）
 */
export async function handleGetAttachment(
  supabase: SupabaseClient,
  attachmentId: string,
): Promise<ApiResult> {
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  // 2. Validate id
  if (!attachmentId) {
    return { status: 400, body: { error: 'Missing attachment id' } }
  }

  // 使用 admin client 繞過 RLS（新對話建立的附件可能因為未綁定現存 message FK 而無法用普通 client 讀取）
  const adminClient = getAdminClient(supabase);

  // 3. 查詢附件
  try {
    const { data: attachment, error: fetchError } = await adminClient
      .from('skill_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single()

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    if (!attachment) {
      return { status: 404, body: { error: 'Attachment not found' } }
    }

    const typed = attachment as unknown as SkillAttachment

    return {
      status: 200,
      body: {
        id: typed.id,
        fileName: typed.file_name,
        fileType: typed.file_type,
        mimeType: typed.mime_type,
        fileSize: typed.file_size,
        storagePath: typed.storage_path,
        previewContent: typed.preview_content,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch attachment'
    return { status: 500, body: { error: message } }
  }
}
