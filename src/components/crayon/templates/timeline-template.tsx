'use client'

import { CalendarRange } from 'lucide-react'

interface TimelineEvent {
  name: string
  start: string
  end?: string
  milestones?: string[]
}

interface TimelineTemplateProps {
  title: string
  startDate: string
  endDate: string
  events: TimelineEvent[]
}

type DatePrecision = 'day' | 'month' | 'year'
type TickGranularity = 'day' | 'month' | 'year'

const EVENT_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300', milestone: 'bg-blue-600' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', bar: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', milestone: 'bg-violet-600' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', milestone: 'bg-emerald-600' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', milestone: 'bg-amber-600' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', milestone: 'bg-rose-600' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', bar: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', milestone: 'bg-cyan-600' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300', milestone: 'bg-orange-600' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', bar: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300', milestone: 'bg-indigo-600' },
]

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31)
}

function parseDateWithPrecision(
  dateStr: unknown,
  fallbackYear?: number,
  fallbackDate?: Date,
): { date: Date; precision: DatePrecision } | null {
  const raw = String(dateStr ?? '').trim()
  if (!raw) return null

  // 支援純時間格式 (HH:mm) - 使用 fallbackDate 的日期部分
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (timeMatch && fallbackDate) {
    const hours = Number(timeMatch[1])
    const minutes = Number(timeMatch[2])
    const parsed = new Date(
      fallbackDate.getFullYear(),
      fallbackDate.getMonth(),
      fallbackDate.getDate(),
      hours,
      minutes
    )
    if (!Number.isNaN(parsed.getTime())) {
      return { date: parsed, precision: 'day' }
    }
  }

  // 支援 "Day 1", "Day 2", "第1天" (Relative Date)
  // 將其映射為「今天 + (N-1) 天」，讓行程日期反映真實日期
  const dayMatch = raw.match(/^(?:Day|第)\s*(\d+)/i)
  if (dayMatch) {
    const dayOffset = Number(dayMatch[1]) - 1 // Day 1 = 今天, Day 2 = 明天
    const today = fallbackDate ?? new Date()
    const parsed = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset)
    return { date: parsed, precision: 'day' }
  }

  // 支援 2026/03、2026-03、2026/03/15、2026年03月15日
  const ymd = raw
    .replace(/[年月]/g, '/')
    .replace(/日/g, '')
    .match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/)
  if (ymd) {
    const y = Number(ymd[1])
    const m = Number(ymd[2])
    const d = ymd[3] ? Number(ymd[3]) : 1
    const parsed = new Date(y, m - 1, d)
    if (Number.isNaN(parsed.getTime())) return null
    return { date: parsed, precision: ymd[3] ? 'day' : 'month' }
  }

  // 支援 2026 (僅年份)
  const yr = raw.match(/^(\d{4})$/)
  if (yr) {
    const parsed = new Date(Number(yr[1]), 0, 1)
    if (Number.isNaN(parsed.getTime())) return null
    return { date: parsed, precision: 'year' }
  }

  // 支援 3月、3月15日（用 fallbackYear 補年份）
  const md = raw
    .replace(/[月]/g, '/')
    .replace(/日/g, '')
    .match(/^(\d{1,2})(?:[/-](\d{1,2}))?$/)
  if (md && fallbackYear) {
    const m = Number(md[1])
    const d = md[2] ? Number(md[2]) : 1
    const parsed = new Date(fallbackYear, m - 1, d)
    if (Number.isNaN(parsed.getTime())) return null
    return { date: parsed, precision: md[2] ? 'day' : 'month' }
  }

  // 嚴格模式：避免像 "1" 被 JS Date 解析成 2001 年，導致軸線錯誤
  // 未命中上方明確格式時，直接視為無效日期
  return null
}

function parseDate(dateStr: unknown, fallbackYear?: number, fallbackDate?: Date): Date | null {
  const parsed = parseDateWithPrecision(dateStr, fallbackYear, fallbackDate)
  return parsed?.date ?? null
}

function formatDateLabel(date: Date | null, granularity: TickGranularity = 'month', isTime = false): string {
  if (!date) return '未設定'

  // 如果是純時間，只顯示 HH:mm
  if (isTime) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  if (granularity === 'day') {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  }
  if (granularity === 'month') {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  return `${date.getFullYear()}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function dateTicks(start: Date, end: Date): Date[] {
  const ticks: Date[] = []
  let current = new Date(start)
  while (current <= end) {
    ticks.push(new Date(current))
    current = addDays(current, 1)
  }
  return ticks
}

function resolveTimelineRange(
  inputStart: string,
  inputEnd: string,
  events: TimelineEvent[],
): { start: Date; end: Date } {
  const startParsed = parseDateWithPrecision(inputStart)
  const endParsed = parseDateWithPrecision(inputEnd)
  const explicitYear = startParsed?.date.getFullYear() ?? endParsed?.date.getFullYear()

  // 如果 startDate/endDate 是完整日期，用作時間的基準日期
  const baseDateForTime = startParsed?.date ?? endParsed?.date ?? new Date()

  const points: Date[] = []

  for (const event of events) {
    const s = parseDate(event.start, explicitYear, baseDateForTime)
    const e = parseDate(event.end, explicitYear, baseDateForTime)
    if (s) points.push(s)
    if (e) points.push(e)
    for (const milestone of event.milestones ?? []) {
      const ms = parseDate(milestone, explicitYear, baseDateForTime)
      if (ms) points.push(ms)
    }
  }

  // 1. 先計算所有事件的時間點範圍
  const minPoint = points.length > 0 ? Math.min(...points.map(p => p.getTime())) : null
  const maxPoint = points.length > 0 ? Math.max(...points.map(p => p.getTime())) : null

  // 2. 解析傳入的 startDate / endDate
  let start = startParsed?.date ?? null
  let end = endParsed?.date ?? null

  if (startParsed?.precision === 'month' && start) start = startOfMonth(start)
  if (startParsed?.precision === 'year' && start) start = startOfYear(start)
  if (endParsed?.precision === 'month' && end) end = endOfMonth(end)
  if (endParsed?.precision === 'year' && end) end = endOfYear(end)

  // 3. 自動擴展範圍以包含所有事件 (Fix: 解決事件超出預設範圍的問題)
  if (minPoint !== null) {
    if (!start || minPoint < start.getTime()) {
      start = new Date(minPoint)
    }
  }
  if (maxPoint !== null) {
    if (!end || maxPoint > end.getTime()) {
      end = new Date(maxPoint)
    }
  }

  // 4. 兜底預設值
  if (!start) start = new Date()
  if (!end) end = new Date(start.getFullYear(), start.getMonth() + 6, 1)

  // 5. 確保 end >= start (至少 1 天)
  if (end.getTime() <= start.getTime()) {
    end = addDays(start, 1)
  }

  return { start, end }
}

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = []
  const current = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)

  while (current <= endMonth) {
    months.push(`${current.getFullYear()}/${String(current.getMonth() + 1).padStart(2, '0')}`)
    current.setMonth(current.getMonth() + 1)
  }

  return months
}

function yearsBetween(start: Date, end: Date): number[] {
  const years: number[] = []
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()

  for (let y = startYear; y <= endYear; y++) {
    years.push(y)
  }
  return years
}

function getPosition(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  if (total <= 0) return 0
  const offset = date.getTime() - rangeStart.getTime()
  return Math.max(0, Math.min(100, (offset / total) * 100))
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function getPositionByGranularity(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
  granularity: TickGranularity,
): number {
  if (granularity === 'day') {
    return getPosition(date, rangeStart, rangeEnd)
  }

  if (granularity === 'month') {
    const startMonthIndex = rangeStart.getFullYear() * 12 + rangeStart.getMonth()
    const endMonthIndex = rangeEnd.getFullYear() * 12 + rangeEnd.getMonth()
    const monthSpan = Math.max(1, endMonthIndex - startMonthIndex + 1)
    const currentMonthIndex = date.getFullYear() * 12 + date.getMonth()
    const monthOffset = currentMonthIndex - startMonthIndex
    const dayRatio = (date.getDate() - 1) / daysInMonth(date)
    const normalized = (monthOffset + dayRatio) / monthSpan
    return Math.max(0, Math.min(100, normalized * 100))
  }

  const yearSpan = Math.max(1, rangeEnd.getFullYear() - rangeStart.getFullYear() + 1)
  const yearOffset = date.getFullYear() - rangeStart.getFullYear()
  const startOfThisYear = new Date(date.getFullYear(), 0, 1)
  const startOfNextYear = new Date(date.getFullYear() + 1, 0, 1)
  const yearProgress = (date.getTime() - startOfThisYear.getTime()) / (startOfNextYear.getTime() - startOfThisYear.getTime())
  const normalized = (yearOffset + yearProgress) / yearSpan
  return Math.max(0, Math.min(100, normalized * 100))
}

export function TimelineTemplate({ title, startDate, endDate, events }: TimelineTemplateProps) {
  const rawEvents = Array.isArray(events) ? events : []

  // 取得 startDate/endDate 作為 fallback 基準日期（用於 "Day N" 格式解析）
  const baseDateForSort = parseDateWithPrecision(startDate)?.date ?? parseDateWithPrecision(endDate)?.date ?? new Date()
  const implicitYearForSort = baseDateForSort.getFullYear()

  // 按 start 日期排序事件（確保時間軸順序正確）
  const safeEvents = [...rawEvents].sort((a, b) => {
    const aDate = parseDate(a.start, implicitYearForSort, baseDateForSort)
    const bDate = parseDate(b.start, implicitYearForSort, baseDateForSort)
    if (!aDate && !bDate) return 0
    if (!aDate) return 1
    if (!bDate) return -1
    return aDate.getTime() - bDate.getTime()
  })

  const { start: rangeStart, end: rangeEnd } = resolveTimelineRange(startDate, endDate, safeEvents)
  const implicitYear = rangeStart.getFullYear()
  const baseDateForTime = parseDateWithPrecision(startDate)?.date ?? parseDateWithPrecision(endDate)?.date ?? new Date()
  const rangeDays = daysBetween(rangeStart, rangeEnd)

  // 檢測是否為同一天的時間範圍
  const isSameDayTimeRange =
    rangeStart.getFullYear() === rangeEnd.getFullYear() &&
    rangeStart.getMonth() === rangeEnd.getMonth() &&
    rangeStart.getDate() === rangeEnd.getDate()

  // Granularity logic — 優先使用月度刻度，避免日期過密溢出容器
  let granularity: TickGranularity = 'day'
  if (rangeDays > 14) granularity = 'month'  // 超過 2 週改月度
  if (rangeDays > 730) granularity = 'year'  // 超過 2 年改年度

  const months = granularity === 'month' ? monthsBetween(rangeStart, rangeEnd) : []
  const days = granularity === 'day' && !isSameDayTimeRange ? dateTicks(rangeStart, rangeEnd) : []
  const years = granularity === 'year' ? yearsBetween(rangeStart, rangeEnd) : []

  // 如果是同一天的時間範圍，生成小時刻度
  const hours: Date[] = []
  if (isSameDayTimeRange) {
    const startHour = rangeStart.getHours()
    const endHour = rangeEnd.getHours() + (rangeEnd.getMinutes() > 0 ? 1 : 0)
    for (let h = startHour; h <= endHour; h++) {
      hours.push(new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), h, 0))
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <CalendarRange size={16} className="text-blue-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate">{title}</span>
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
          {formatDateLabel(rangeStart, granularity)} - {formatDateLabel(rangeEnd, granularity)}
        </div>
      </div>

      <div className="p-4 overflow-x-auto min-w-0">
        {/* 甘特圖容器 — 月數多時可橫向捲動 */}
        <div className="relative" style={{ minWidth: granularity === 'month' ? `${Math.max(months.length * 80, 100)}px` : granularity === 'year' ? `${Math.max(years.length * 100, 100)}px` : undefined }}>

          {/* Timeline Header (Axis) */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
            <div className="w-[180px] flex-shrink-0" />
            <div className="flex-1 flex">
              {isSameDayTimeRange && hours.map((h) => (
                <div
                  key={h.toISOString()}
                  className="text-[10px] text-gray-500 dark:text-gray-400 text-center font-medium"
                  style={{ width: `${100 / hours.length}%` }}
                >
                  {String(h.getHours()).padStart(2, '0')}:00
                </div>
              ))}
              {!isSameDayTimeRange && granularity === 'day' && days.map((d) => (
                <div
                  key={d.toISOString()}
                  className="text-[10px] text-gray-500 dark:text-gray-400 text-center font-medium"
                  style={{ width: `${100 / days.length}%` }}
                >
                  {String(d.getMonth() + 1).padStart(2, '0')}/{String(d.getDate()).padStart(2, '0')}
                </div>
              ))}
              {granularity === 'month' && months.map((m) => (
                <div
                  key={m}
                  className="text-[11px] text-gray-500 dark:text-gray-400 text-center font-medium"
                  style={{ width: `${100 / months.length}%` }}
                >
                  {m.split('/')[1]}月
                </div>
              ))}
              {granularity === 'year' && years.map((y) => (
                <div
                  key={y}
                  className="text-[11px] text-gray-500 dark:text-gray-400 text-center font-medium"
                  style={{ width: `${100 / years.length}%` }}
                >
                  {y}
                </div>
              ))}
            </div>
          </div>

          {/* Events */}
          <div className="space-y-3">
            {safeEvents.length === 0 && (
              <div className="text-xs text-gray-400 py-3">無時程資料</div>
            )}
            {safeEvents.map((event, idx) => {
              const color = EVENT_COLORS[idx % EVENT_COLORS.length]
              const startParsed = parseDateWithPrecision(event.start, implicitYear, baseDateForTime)
              const endParsed = parseDateWithPrecision(event.end, implicitYear, baseDateForTime)
              let eventStart = startParsed?.date ?? null
              let eventEnd = endParsed?.date ?? (eventStart ? new Date(eventStart) : null)

              if (!eventStart || !eventEnd) return null

              // 讓「月份/年份精度」在月份軸下顯示為完整區段，而非細線
              if (startParsed?.precision === 'month') eventStart = startOfMonth(eventStart)
              if (startParsed?.precision === 'year') eventStart = startOfYear(eventStart)

              if (endParsed?.precision === 'month') eventEnd = endOfMonth(eventEnd)
              if (endParsed?.precision === 'year') eventEnd = endOfYear(eventEnd)

              if (!event.end) {
                if (startParsed?.precision === 'month') eventEnd = endOfMonth(eventStart)
                if (startParsed?.precision === 'year') eventEnd = endOfYear(eventStart)
              }

              if (granularity === 'day' && eventEnd.getTime() === eventStart.getTime()) {
                eventEnd = addDays(eventEnd, 1)
              }

              const left = getPositionByGranularity(eventStart, rangeStart, rangeEnd, granularity)
              const right = getPositionByGranularity(eventEnd, rangeStart, rangeEnd, granularity)
              const isSameMonth =
                eventStart.getFullYear() === eventEnd.getFullYear() &&
                eventStart.getMonth() === eventEnd.getMonth()
              const isSameYear = eventStart.getFullYear() === eventEnd.getFullYear()
              const slotWidthMonth = 100 / Math.max(months.length, 1)
              const slotWidthYear = 100 / Math.max(years.length, 1)

              let width = Math.max(right - left, 0.5)
              if (granularity === 'month' && isSameMonth) {
                // 單月事件至少佔一個月欄位寬
                width = Math.max(width, slotWidthMonth)
              } else if (granularity === 'year' && isSameYear) {
                // 單年事件至少佔一年欄位寬
                width = Math.max(width, slotWidthYear)
              }
              const adjustedLeft = Math.max(0, Math.min(left, 100 - width))

              // 檢測是否為純時間（同一天內的時間範圍）
              const isTimeRange =
                eventStart.getFullYear() === eventEnd.getFullYear() &&
                eventStart.getMonth() === eventEnd.getMonth() &&
                eventStart.getDate() === eventEnd.getDate() &&
                (eventStart.getHours() !== 0 || eventStart.getMinutes() !== 0 ||
                 eventEnd.getHours() !== 0 || eventEnd.getMinutes() !== 0)

              return (
                <div key={`event-${idx}`} className="flex items-center min-h-[44px]">
                  {/* Label */}
                  <div className="w-[180px] flex-shrink-0 pr-3">
                    <div className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium ${color.text} ${color.bg} max-w-full`}>
                      <span className="truncate" title={event.name}>{event.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 truncate">
                      {formatDateLabel(eventStart, granularity, isTimeRange)}
                      {eventEnd.getTime() !== eventStart.getTime() ? ` - ${formatDateLabel(eventEnd, granularity, isTimeRange)}` : ''}
                    </div>
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative h-[30px]">
                    {/* Background grid lines */}
                    <div className="absolute inset-0 flex opacity-20">
                      {isSameDayTimeRange && hours.map((_, i) => (
                        <div key={i} className={`h-full border-r border-gray-300 dark:border-gray-600`} style={{ width: `${100 / hours.length}%` }} />
                      ))}
                      {!isSameDayTimeRange && granularity === 'day' && days.map((_, i) => (
                        <div key={i} className={`h-full border-r border-gray-300 dark:border-gray-600`} style={{ width: `${100 / days.length}%` }} />
                      ))}
                      {granularity === 'month' && months.map((_, i) => (
                        <div key={i} className={`h-full border-r border-gray-300 dark:border-gray-600`} style={{ width: `${100 / months.length}%` }} />
                      ))}
                      {granularity === 'year' && years.map((_, i) => (
                        <div key={i} className={`h-full border-r border-gray-300 dark:border-gray-600`} style={{ width: `${100 / years.length}%` }} />
                      ))}
                    </div>

                    {/* Event bar */}
                    <div
                      className={`absolute top-[4px] h-[22px] rounded-full ${color.bar} opacity-90 shadow-sm`}
                      style={{ left: `${adjustedLeft}%`, width: `${width}%` }}
                    />

                    {/* Milestones */}
                    {event.milestones?.map((ms, mi) => {
                      const msParsed = parseDateWithPrecision(ms, implicitYear, baseDateForTime)
                      let msDate = msParsed?.date ?? null
                      if (!msDate) return null
                      // 月份里程碑落在月中、年份里程碑落在年中，視覺更直觀
                      if (msParsed?.precision === 'month') {
                        msDate = new Date(msDate.getFullYear(), msDate.getMonth(), 15)
                      } else if (msParsed?.precision === 'year') {
                        msDate = new Date(msDate.getFullYear(), 6, 1)
                      }
                      const msPos = getPositionByGranularity(msDate, rangeStart, rangeEnd, granularity)
                      return (
                        <div
                          key={`ms-${idx}-${mi}`}
                          className={`absolute top-[1px] w-[10px] h-[10px] rotate-45 ${color.milestone} border border-white dark:border-gray-900 shadow-sm`}
                          style={{ left: `calc(${msPos}% - 5px)`, top: '8px' }}
                          title={formatDateLabel(msDate, granularity)}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer Range Label */}
          <div className="flex mt-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="w-[180px] flex-shrink-0" />
            <div className="flex-1 text-center text-[11px] text-gray-400">
              {formatDateLabel(rangeStart, granularity)} - {formatDateLabel(rangeEnd, granularity)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
