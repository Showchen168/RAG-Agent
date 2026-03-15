import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Loader2, Search, Brain, Sparkles, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ThinkingAccordionProps {
    isLoading?: boolean
    mode?: 'search' | 'default'
}

const ThinkingWithDots = () => {
    const fullText = "Thinking..."
    const [cycle, setCycle] = useState(0)

    // 每 3 秒重啟打字動畫（loop）
    useEffect(() => {
        const timer = setInterval(() => {
            setCycle(c => c + 1)
        }, 3000)
        return () => clearInterval(timer)
    }, [])

    return (
        <span className="font-bold inline-flex items-baseline text-blue-500 text-sm" key={cycle}>
            <motion.span
                initial="hidden"
                animate="visible"
                variants={{
                    hidden: {},
                    visible: {
                        transition: {
                            staggerChildren: 0.08,
                        }
                    }
                }}
            >
                {fullText.split("").map((char, i) => (
                    <motion.span
                        key={`c-${i}`}
                        variants={{
                            hidden: { opacity: 0, y: 3 },
                            visible: {
                                opacity: 1,
                                y: 0,
                                transition: { duration: 0.12, ease: "easeOut" }
                            }
                        }}
                        className={char === '.' ? 'text-lg leading-none relative -top-[1px]' : ''}
                    >
                        {char}
                    </motion.span>
                ))}
            </motion.span>
        </span>
    )
}

export function ThinkingAccordion({ isLoading = false, mode = 'default' }: ThinkingAccordionProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [step, setStep] = useState(0)
    const [isComplete, setIsComplete] = useState(false)

    const steps = mode === 'search' ? [
        { icon: Search, text: '正在搜尋網路資源...', duration: 2500 },
        { icon: Brain, text: '分析搜尋結果...', duration: 2000 },
        { icon: Sparkles, text: '整合資訊中...', duration: 1500 }
    ] : [
        { icon: Search, text: '搜尋知識庫與網路資源...', duration: 2500 },
        { icon: Brain, text: '思考中...', duration: 2000 },
        { icon: Sparkles, text: '生成回答...', duration: 3000 }
    ]

    useEffect(() => {
        if (!isLoading) {
            // If we were loading and now stopped, mark as complete and show all steps as done
            setIsComplete(true)
            setStep(steps.length - 1)
            return
        }

        setIsComplete(false)
        setStep(0)

        let mounted = true
        const runSteps = async () => {
            for (let i = 0; i < steps.length; i++) {
                if (!mounted || !isLoading) break
                setStep(i)
                await new Promise(resolve => setTimeout(resolve, steps[i].duration))
            }
        }

        runSteps()

        return () => { mounted = false }
    }, [isLoading, mode])

    const textColor = isComplete
        ? "text-green-600 dark:text-green-400"
        : "text-blue-500 dark:text-blue-400"

    return (
        <div className="w-fit max-w-full transition-colors duration-500">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-4 justify-between py-1 text-sm font-medium transition-colors ${textColor}`}
            >
                <div className="flex items-center gap-2">
                    {isComplete ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <div className="flex items-center">
                        {isComplete ? '搜尋完成' : <ThinkingWithDots />}
                    </div>
                </div>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-3"
                    >
                        <div className="space-y-2 mt-1 pb-2">
                            {steps.map((s, index) => {
                                // Logic:
                                // If complete: All steps visible and colored "past" (green/done)
                                // If loading: Current is blue/pulse, Fast is green, Future is gray
                                const isCurrent = !isComplete && index === step
                                const isPast = isComplete || index < step
                                const Icon = s.icon

                                return (
                                    <div
                                        key={index}
                                        className={`flex items-center gap-2.5 text-xs transition-colors duration-300 ${isCurrent ? 'text-blue-700 dark:text-blue-300 font-medium' :
                                            isPast ? 'text-green-600 dark:text-green-500' :
                                                'text-gray-400 dark:text-gray-600'
                                            }`}
                                    >
                                        <div className={`
                                            w-4 h-4 flex items-center justify-center shrink-0
                                            ${isCurrent ? 'text-blue-500 animate-pulse' :
                                                isPast ? 'text-green-500' :
                                                    'text-gray-300 dark:text-gray-600'}
                                        `}>
                                            <Icon className="w-2.5 h-2.5" />
                                        </div>
                                        <span>{s.text}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
