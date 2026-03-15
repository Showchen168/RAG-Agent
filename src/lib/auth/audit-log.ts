import { createAdminClient } from '@/lib/supabase/server'

export type AuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  | 'register_success'
  | 'register_failed'
  | 'register_rate_limited'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'telegram_linked'
  | 'telegram_unlinked'

interface AuditLogEntry {
  event: AuditEvent
  userId?: string
  ip?: string
  metadata?: Record<string, unknown>
}

/**
 * 非同步寫入稽核日誌，不阻塞主要流程。
 * 寫入失敗只記錄 console.error，不影響使用者操作。
 */
export function writeAuditLog(entry: AuditLogEntry): void {
  const supabase = createAdminClient()

  supabase
    .from('audit_logs')
    .insert({
      event: entry.event,
      user_id: entry.userId ?? null,
      ip_address: entry.ip ?? null,
      metadata: entry.metadata ?? null,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[audit-log] Failed to write:', error.message)
      }
    })
}
