/**
 * 安全的 UUID v4 生成函式。
 *
 * `crypto.randomUUID()` 僅在 Secure Context（HTTPS 或 localhost）下可用。
 * 在 HTTP 環境（例如區網 NAS 部署 http://192.168.x.x）下會拋出
 * `TypeError: crypto.randomUUID is not a function`。
 *
 * 此函式自動降級為 `crypto.getRandomValues()` 實作，
 * 後者在所有現代瀏覽器中均可用（不限 Secure Context）。
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback: 使用 crypto.getRandomValues() 手動產生 UUID v4
  // 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // 設定 version 4 (0100)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // 設定 variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
