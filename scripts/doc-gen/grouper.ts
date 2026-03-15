import type { ParsedRoute, ApiGroup } from './types'

/** 群組描述對照表（第一層目錄 → 中文描述） */
const GROUP_DESCRIPTIONS: Record<string, string> = {
  chat: '對話與 AI 串流',
  knowledge: '知識庫管理',
  skills: '技能管理與執行',
  conversations: '對話歷史與管理',
  research: '深度研究與報告',
  canvas: 'Canvas 文件編輯',
  telegram: 'Telegram Bot 整合',
  reports: '報告生成與匯出',
  prompts: '提示詞模板管理',
  copilot: 'Copilot 助手',
  rube: 'Rube 資料管道',
  admin: '系統管理',
  auth: '認證與授權',
  services: '後端服務',
  cron: '排程任務',
}

/**
 * 將 ParsedRoute[] 依第一層目錄分組，
 * 回傳排序後的 ApiGroup[]
 */
export function groupRoutes(routes: ParsedRoute[]): ApiGroup[] {
  const map = new Map<string, ParsedRoute[]>()

  for (const route of routes) {
    const existing = map.get(route.group) ?? []
    existing.push(route)
    map.set(route.group, existing)
  }

  const groups: ApiGroup[] = []

  for (const [name, groupRoutes] of map) {
    groups.push({
      name,
      description: GROUP_DESCRIPTIONS[name] ?? name,
      routes: groupRoutes.sort((a, b) => a.apiPath.localeCompare(b.apiPath)),
    })
  }

  return groups.sort((a, b) => {
    // 依 route 數量降序，同數量依名稱字母序
    if (b.routes.length !== a.routes.length) {
      return b.routes.length - a.routes.length
    }
    return a.name.localeCompare(b.name)
  })
}
