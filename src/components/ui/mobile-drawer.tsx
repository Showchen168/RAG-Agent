"use client";

import { X } from "lucide-react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  side: "bottom" | "right";
  title: string;
  children: React.ReactNode;
}

export function MobileDrawer({
  open,
  onClose,
  side,
  title,
  children,
}: MobileDrawerProps) {
  if (!open) return null;

  const isBottom = side === "bottom";

  return (
    <div className="fixed inset-0 z-50">
      <div
        data-testid="drawer-backdrop"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        data-testid="drawer-panel"
        className={`fixed bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col ${
          isBottom
            ? "bottom-0 left-0 right-0 max-h-[80vh] rounded-t-2xl"
            : "right-0 top-0 bottom-0 w-[85vw] max-w-sm"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
