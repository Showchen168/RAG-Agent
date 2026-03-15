"use client";

/**
 * Skill Loading Indicator
 * Shows loading status when skills are being loaded on demand.
 * Displays "Loading skill XXX..." with animation.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { SkillLoadingState } from "@/hooks/use-skill-lazy-loading";

interface SkillLoadingIndicatorProps {
  readonly loadingSkills: ReadonlyArray<SkillLoadingState>;
}

export function SkillLoadingIndicator({
  loadingSkills,
}: SkillLoadingIndicatorProps) {
  if (loadingSkills.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col gap-1.5 px-3 py-2"
      >
        {loadingSkills.map((skill) => (
          <motion.div
            key={skill.skillName}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex items-center gap-2 text-xs"
          >
            {skill.status === "loading" && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span className="text-gray-500 dark:text-gray-400">
                  {`正在載入技能 ${skill.displayName}...`}
                </span>
              </>
            )}
            {skill.status === "loaded" && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  {`技能 ${skill.displayName} 已載入`}
                </span>
              </>
            )}
            {skill.status === "error" && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-500 dark:text-red-400">
                  {`技能 ${skill.displayName} 載入失敗`}
                </span>
              </>
            )}
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
