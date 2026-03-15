"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatSessionProvider } from "@/components/chat/chat-session-context";

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <ChatSessionProvider>
      <div className="flex h-dvh bg-background overflow-hidden">
        {/* 桌面版 sidebar：可折疊 */}
        <div
          className={`hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}
        >
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
          />
        </div>

        {/* 手機版 sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* 背景遮罩 */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Sidebar */}
            <div className="fixed inset-y-0 left-0 z-50 w-64 shadow-xl">
              <Sidebar
                collapsed={false}
                onToggleCollapse={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* 主要內容 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* 頂部導航列 - 只顯示手機版漢堡按鈕 */}
          <header className="h-14 flex-shrink-0 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 md:hidden">
            {/* 手機版漢堡按鈕 */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
          </header>
          <div className="flex-1 overflow-hidden min-h-0">{children}</div>
        </main>
      </div>
    </ChatSessionProvider>
  );
}
