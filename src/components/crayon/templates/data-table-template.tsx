"use client";

import { memo, useMemo, useRef } from "react";
import { TableIcon } from "lucide-react";

interface DataTableTemplateProps {
  title?: string;
  headers: string[];
  rows: string[][];
}

/**
 * 效能優化的表格元件
 * - 使用 React.memo 避免串流時的整體重渲染
 * - 單元格使用純文字渲染（跳過 MarkdownRenderer 以大幅降低 DOM 開銷）
 * - 只對新增的 row 播放動畫，已有的 row 不再重播
 */
export const DataTableTemplate = memo(function DataTableTemplate({
  title,
  headers,
  rows,
}: DataTableTemplateProps) {
  const validHeaders = useMemo(
    () => (Array.isArray(headers) ? headers : []),
    [headers],
  );
  const validRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  // 追蹤已動畫過的行數
  const animatedCountRef = useRef(0);
  const prevRowCount = animatedCountRef.current;
  animatedCountRef.current = validRows.length;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden my-4">
      {title && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <TableIcon size={16} className="text-emerald-500" />
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-auto">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
              {validHeaders.map((header, idx) => (
                <th
                  key={`h-${idx}`}
                  className="px-3 md:px-4 py-2.5 text-left font-semibold text-foreground align-top"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {validRows.map((row, rowIdx) => {
              const isNewRow = rowIdx >= prevRowCount;
              return (
                <MemoizedTableRow
                  key={`row-${rowIdx}`}
                  row={row}
                  rowIdx={rowIdx}
                  isNewRow={isNewRow}
                  prevRowCount={prevRowCount}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/** 單獨 memoize 每一行，避免新增行時重新渲染所有行 */
const MemoizedTableRow = memo(function MemoizedTableRow({
  row,
  rowIdx,
  isNewRow,
  prevRowCount,
}: {
  row: string[];
  rowIdx: number;
  isNewRow: boolean;
  prevRowCount: number;
}) {
  return (
    <tr
      className={`border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
        rowIdx % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/20" : ""
      }${isNewRow ? " animate-table-row-fade-in" : ""}`}
      style={
        isNewRow
          ? { animationDelay: `${(rowIdx - prevRowCount) * 50}ms` }
          : undefined
      }
    >
      {Array.isArray(row)
        ? row.map((cell, cellIdx) => (
            <td
              key={`c-${rowIdx}-${cellIdx}`}
              className="px-3 md:px-4 py-2 text-foreground align-top break-words whitespace-pre-wrap"
            >
              {cell}
            </td>
          ))
        : null}
    </tr>
  );
});
