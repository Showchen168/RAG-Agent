"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Persona } from "@/lib/crayon/prompts";
import type { Skill } from "@/types/skills";

/** 統一 props：支援 persona 和 skill 兩種模式 */
interface PersonaDetailPanelProps {
    persona?: Persona;
    skill?: Skill;
    onQuickPrompt: (text: string) => void;
}

/**
 * 根據 persona 名稱 / 描述 / systemPrompt 生成快速開始提示語
 */
function generatePersonaQuickStarters(persona: Persona): string[] {
    const name = persona.name;
    const desc = (persona.description || "").toLowerCase();

    const starters: Record<string, string[]> = {
        "專業技術顧問": [
            "我想將單體應用重構為微服務，該如何規劃？",
            "比較 PostgreSQL 和 MongoDB 的優缺點",
            "如何設計一個可擴展的 API 架構？",
        ],
        "創意文案寫手": [
            "幫我寫一則 Instagram 新品上市貼文",
            "設計一句能在 3 秒內抓住注意力的廣告標題",
            "幫我想 5 個產品品牌命名方向",
        ],
        "數據分析專家": [
            "如何設計一個有效的 A/B 測試？",
            "我的網站跳出率很高，該怎麼分析原因？",
            "幫我規劃一份月度 KPI 追蹤報告",
        ],
        "程式碼審查員": [
            "請幫我審查這段 React 元件程式碼",
            "如何降低程式碼的圈複雜度？",
            "檢查此 API 端點是否有安全漏洞",
        ],
        "學習導師": [
            "用簡單的方式解釋什麼是 RESTful API",
            "我想學 Python，請幫我規劃學習路線",
            "向我解釋機器學習的基本概念",
        ],
        "產品經理助手": [
            "幫我用 RICE 評分法排序功能優先順序",
            "撰寫一份新功能的 PRD 文件",
            "分析競品的核心功能差異",
        ],
        "簡報大師": [
            "幫我設計一份季度成果報告的架構",
            "如何在開場 30 秒內抓住觀眾注意力？",
            "設計一份創業投資提案簡報大綱",
        ],
        "UI/UX 設計顧問": [
            "評估這個登入頁面的使用者體驗",
            "如何設計一個直覺的導航結構？",
            "建議適合 SaaS 產品的配色方案",
        ],
        "SEO 優化專家": [
            "幫我做一份網站 SEO 健康檢查",
            "如何規劃內容叢集策略？",
            "優化我的文章標題和 Meta Description",
        ],
        "敏捷教練": [
            "我們的 Sprint Review 效果不好，怎麼改善？",
            "如何從零開始導入 Scrum？",
            "設計一個有趣的 Retrospective 活動",
        ],
    };

    if (starters[name]) return starters[name];

    if (desc.includes("程式") || desc.includes("code") || desc.includes("開發")) {
        return [
            "幫我優化這段程式碼的效能",
            "如何處理這個技術問題？",
            "建議最佳的實作方式",
        ];
    }
    if (desc.includes("文案") || desc.includes("寫作") || desc.includes("創意")) {
        return [
            "幫我撰寫一段吸引人的文案",
            "產生幾個創意靈感方向",
            "潤飾這段文字讓它更生動",
        ];
    }
    if (desc.includes("分析") || desc.includes("數據") || desc.includes("data")) {
        return [
            "幫我分析這份資料的趨勢",
            "如何建立有效的指標追蹤？",
            "設計一份數據報告",
        ];
    }

    return [
        `請問 ${persona.name} 可以幫我做什麼？`,
        "給我一些使用建議",
        "幫我完成一項任務",
    ];
}

/**
 * 根據 skill 的 category / description 生成快速開始提示語
 */
function generateSkillQuickStarters(skill: Skill): string[] {
    const desc = (skill.description || "").toLowerCase();
    const category = skill.category;

    if (desc.includes("報告") || desc.includes("report")) {
        return [
            "幫我產出一份專業的分析報告",
            "根據最近的對話生成摘要報告",
            "製作一份簡潔的週報",
        ];
    }
    if (desc.includes("翻譯") || desc.includes("translat")) {
        return [
            "將這段文字翻譯成英文",
            "翻譯成日文並保留專業術語",
            "幫我潤飾這段翻譯",
        ];
    }
    if (category === "document") {
        return [
            "幫我生成一份深入的產業分析報告",
            "撰寫一份詳細的專案執行方案",
            "將重點大綱擴充成完整的結構化報告",
        ];
    }
    if (category === "data") {
        return [
            "分析這份數據的趨勢",
            "產出數據視覺化建議",
            "找出數據中的異常值",
        ];
    }
    if (category === "creative") {
        return [
            "幫我產出創意內容",
            "根據主題生成有趣的想法",
            "設計一個吸引人的方案",
        ];
    }

    return [
        `使用 ${skill.display_name} 處理任務`,
        "幫我完成一項工作",
        "試試這個技能的功能",
    ];
}

export function PersonaDetailPanel({
    persona,
    skill,
    onQuickPrompt,
}: PersonaDetailPanelProps) {
    const [expanded, setExpanded] = useState(true);

    const description = persona?.description || skill?.description || "";
    const quickStarters = useMemo(() => {
        if (persona) return generatePersonaQuickStarters(persona);
        if (skill) return generateSkillQuickStarters(skill);
        return [];
    }, [persona, skill]);

    const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

    const label = persona ? "助理描述" : "技能描述";

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full mt-4"
        >
            {/* Header */}
            <button
                onClick={toggleExpanded}
                className="w-full flex items-center justify-between px-1 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {label}
                </span>
                {expanded ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
            </button>

            {/* Body */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        {/* Description */}
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 mb-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                {description || "尚未提供描述。"}
                            </p>
                        </div>

                        {/* Quick Starters */}
                        <div className="flex flex-wrap gap-2">
                            {quickStarters.map((prompt, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => onQuickPrompt(prompt)}
                                    className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-150 text-left leading-snug"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
