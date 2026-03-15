export { TextTemplate } from './text-template'
export { DataTableTemplate } from './data-table-template'
export { ChartTemplate } from './chart-template'
export { TimelineTemplate } from './timeline-template'
export { StepsTemplate } from './steps-template'
export { CompareTemplate } from './compare-template'

import { TextTemplate } from './text-template'
import { DataTableTemplate } from './data-table-template'
import { ChartTemplate } from './chart-template'
import { TimelineTemplate } from './timeline-template'
import { StepsTemplate } from './steps-template'
import { CompareTemplate } from './compare-template'

/** Template 定義（移除 Crayon ResponseTemplate 依賴） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TemplateEntry {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: React.ComponentType<any>
}

/**
 * Template 陣列 — assistant-message-renderer 的 TEMPLATE_MAP 使用這個匹配 template name。
 *
 * name 必須和 schema（buildStructuredOutputPrompt）中定義的 name 一致（snake_case）。
 */
export const responseTemplates: TemplateEntry[] = [
  {
    name: 'TextTemplate',
    Component: TextTemplate,
  },
  {
    name: 'data_table',
    Component: DataTableTemplate,
  },
  {
    name: 'chart',
    Component: ChartTemplate,
  },
  {
    name: 'timeline',
    Component: TimelineTemplate,
  },
  {
    name: 'steps',
    Component: StepsTemplate,
  },
  {
    name: 'compare',
    Component: CompareTemplate,
  },
]
