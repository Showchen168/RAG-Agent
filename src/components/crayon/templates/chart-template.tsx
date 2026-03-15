'use client'

import { BarChart3 } from 'lucide-react'

interface ChartDataPoint {
  label: string
  value: number
}

interface ChartTemplateProps {
  title: string
  chartType: 'bar' | 'line' | 'pie'
  data: ChartDataPoint[]
  xAxisLabel?: string
  yAxisLabel?: string
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#818cf8', '#7c3aed', '#5b21b6', '#4f46e5',
  '#4338ca', '#3730a3',
]

export function ChartTemplate({ title, chartType, data }: ChartTemplateProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)

  if (chartType === 'pie') {
    const total = data.reduce((sum, d) => sum + d.value, 0)
    let cumulativePercent = 0
    const segments = data.map((d, i) => {
      const percent = (d.value / total) * 100
      const start = cumulativePercent
      cumulativePercent += percent
      return { ...d, percent, start, color: COLORS[i % COLORS.length] }
    })

    const gradientStops = segments
      .map((s) => `${s.color} ${s.start}% ${s.start + s.percent}%`)
      .join(', ')

    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <BarChart3 size={16} className="text-indigo-500" />
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        <div className="flex gap-6 items-center p-4">
          <div
            className="flex-shrink-0"
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: `conic-gradient(${gradientStops})`,
            }}
          />
          <div className="flex flex-col gap-1.5">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-foreground">
                  {s.label}: {s.value} ({s.percent.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (chartType === 'line') {
    const height = 220
    const width = 500 // SVG internal width
    const padding = { top: 20, bottom: 30, left: 40, right: 20 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    // Y-axis scale
    const scaleY = (val: number) => {
      return plotHeight - (val / maxValue) * plotHeight
    }

    // X-axis points
    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1 || 1)) * plotWidth
      const y = padding.top + scaleY(d.value)
      return { x, y, ...d }
    })

    const pathD = points.length > 1
      ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''

    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <BarChart3 size={16} className="text-emerald-500" />
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="min-w-[400px]">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const y = padding.top + plotHeight * (1 - t)
                return (
                  <g key={t}>
                    <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} strokeWidth="1" className="stroke-gray-100 dark:stroke-gray-800" />
                    <text x={padding.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">{Math.round(maxValue * t)}</text>
                  </g>
                )
              })}

              {/* Line */}
              <path d={pathD} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

              {/* Area under line (optional, for aesthetics) */}
              {points.length > 1 && (
                <path
                  d={`${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`}
                  fill="#10b981"
                  fillOpacity="0.1"
                  stroke="none"
                />
              )}

              {/* Points & Labels */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#10b981" strokeWidth="2" />
                  {/* Value Label */}
                  <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[11px] font-bold fill-gray-600 dark:fill-gray-300">{p.value}</text>
                  {/* X-Axis Label */}
                  <text x={p.x} y={height - 5} textAnchor="middle" className="text-[10px] fill-gray-500">{p.label}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // Bar chart (default)
  const BAR_AREA_HEIGHT = 220 // 柱狀區域固定高度（px）

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <BarChart3 size={16} className="text-indigo-500" />
        <span className="font-semibold text-sm text-foreground">{title}</span>
      </div>
      <div className="px-5 pt-4 pb-3">
        {/* 數值 + Bar + 標籤，橫向排列 */}
        <div className="flex items-end gap-1 justify-around">
          {data.map((d, i) => {
            const barHeight = Math.max(Math.round((d.value / maxValue) * BAR_AREA_HEIGHT), 4)
            return (
              <div
                key={d.label}
                className="flex flex-col items-center gap-1 min-w-0"
                style={{ flex: '1 1 0', maxWidth: 80 }}
              >
                {/* 數值 */}
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {d.value}
                </span>
                {/* Bar — 使用固定像素高度 */}
                <div
                  className="rounded-t-md"
                  style={{
                    width: '60%',
                    minWidth: 20,
                    height: barHeight,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
                {/* 標籤 */}
                <span className="text-[11px] text-center text-foreground leading-tight mt-0.5 line-clamp-2 w-full px-0.5">
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
