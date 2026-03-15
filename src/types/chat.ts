/** 訊息 part — 文字或模板 */
export interface NMTextPart {
  type: 'text'
  text: string
}

export interface NMTemplatePart {
  type: 'template'
  name: string
  templateProps: Record<string, unknown>
}

export type NMMessagePart = NMTextPart | NMTemplatePart

/** 使用者訊息 */
export interface NMUserMessage {
  id: string
  role: 'user'
  content: string
  imageContext?: Array<{ image: string; mimeType: string }>
  /** Crayon 相容欄位，過渡期使用 */
  message?: string
  context?: unknown[]
}

/** 助理訊息 */
export interface NMAssistantMessage {
  id: string
  role: 'assistant'
  content: string
  /** 結構化 parts（從 DB 存儲的 JSON 解析） */
  parts?: NMMessagePart[]
  /** 原始的 Crayon-style message 陣列（過渡相容） */
  message?: NMMessagePart[]
}

/** 通用訊息聯合型別 */
export type NMMessage = NMUserMessage | NMAssistantMessage

/** 對話 thread */
export interface NMThread {
  id: string
  title: string
  createdAt: Date
}
