import Link from "next/link";
import {
  Brain,
  MessageSquare,
  BookOpen,
  CheckSquare,
  PenTool,
  GitFork,
  Youtube,
  TerminalSquare,
  Sparkles,
  Rss,
  Globe,
  Bot,
  Database,
} from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquare,
    color: "text-blue-600",
    title: "Gemini 智慧對話",
    desc: "高速即時串流回應，支援多模態圖片辨識與深思熟慮推理",
  },
  {
    icon: Database,
    color: "text-violet-600",
    title: "雙層對話記憶",
    desc: "自動從對話中提取使用者的偏好與事實，讓 AI 越用越懂你",
  },
  {
    icon: BookOpen,
    color: "text-green-600",
    title: "RAG 知識庫",
    desc: "上傳 PDF、Word、Excel 等文件自動向量化，對話時檢索相關知識並標註來源",
  },
  {
    icon: Youtube,
    color: "text-red-600",
    title: "YouTube 知識匯入",
    desc: "貼上影片 URL 自動擷取字幕並生成 AI 摘要；訂閱頻道自動監控新影片",
  },
  {
    icon: TerminalSquare,
    color: "text-orange-600",
    title: "技能沙盒系統",
    desc: "在隔離容器內安全執行 Python/Node.js 程式碼，支援產出分析報告與多種檔案",
  },
  {
    icon: Globe,
    color: "text-teal-600",
    title: "Google Drive 整合",
    desc: "直接匯入 Google Docs、Sheets、Slides，自動解析並加入知識庫",
  },
  {
    icon: Rss,
    color: "text-amber-600",
    title: "網頁 / RSS 監控",
    desc: "訂閱 RSS 或網頁，定期自動檢查並匯入新內容到知識庫",
  },
  {
    icon: PenTool,
    color: "text-pink-600",
    title: "Canvas 編輯器",
    desc: "Markdown 即時編輯與 AI 圖表生成，研究成果可視化",
  },
  {
    icon: GitFork,
    color: "text-cyan-600",
    title: "對話分支",
    desc: "任意節點建立對話分支，探索不同思路而不丟失原始脈絡",
  },
  {
    icon: Brain,
    color: "text-purple-600",
    title: "知識圖譜",
    desc: "視覺化知識節點關聯，用圖譜探索你的知識網路",
  },
  {
    icon: Sparkles,
    color: "text-indigo-600",
    title: "Persona 角色切換",
    desc: "自訂 AI 角色、設定圖示與系統提示詞，快速適應不同對話情境",
  },
  {
    icon: Bot,
    color: "text-sky-600",
    title: "Telegram Bot 整合",
    desc: "無縫串接 Telegram，在手機上也能隨時召喚專屬助理並存取知識庫",
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          NexusMind
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mb-8">
          Next-Generation AI Mind Hub — 知識管理、長期記憶與技能執行的全方位協作平台
        </p>
        <div className="flex gap-3">
          <Link
            href="/register"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            免費開始
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-foreground font-medium rounded-lg transition-colors"
          >
            登入
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="p-6 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <f.icon className={`w-8 h-8 ${f.color} mb-3`} />
            <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
            <p className="text-sm text-gray-500">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pb-8 text-center">
        <p className="text-xs text-gray-400">NexusMind V1.0</p>
      </div>
    </div>
  );
}
