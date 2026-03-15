"use client";

/**
 * Skill Lazy Loading Hook
 * Manages the detection of [LOAD_SKILL: name] markers in AI responses
 * and coordinates on-demand skill loading.
 */

import { useState, useCallback, useRef } from "react";
import {
  detectSkillLoadRequest,
  stripSkillLoadMarkers,
} from "@/lib/skills/stream-detector";
import type { LoadedSkillContent } from "@/lib/skills/lazy-loader";

/** Loading state for a single skill */
export interface SkillLoadingState {
  readonly skillName: string;
  readonly displayName: string;
  readonly status: "loading" | "loaded" | "error";
  readonly error?: string;
}

/** Hook return type */
export interface UseSkillLazyLoadingReturn {
  /** Currently loading skills */
  readonly loadingSkills: ReadonlyArray<SkillLoadingState>;
  /** All loaded skill contents (for injection into conversation) */
  readonly loadedSkills: ReadonlyArray<LoadedSkillContent>;
  /** Process AI response text, detect and handle LOAD_SKILL markers */
  readonly processStreamText: (text: string) => string;
  /** Check if any skills are currently loading */
  readonly isLoadingSkill: boolean;
  /** Clear all loading states */
  readonly clearLoadingStates: () => void;
}

/**
 * Hook for managing skill lazy loading in the chat interface.
 *
 * Usage:
 * 1. Pass AI response text through processStreamText()
 * 2. It strips LOAD_SKILL markers and triggers skill loading
 * 3. Monitor loadingSkills for UI feedback
 * 4. Use loadedSkills to inject into next conversation turn
 */
export function useSkillLazyLoading(): UseSkillLazyLoadingReturn {
  const [loadingSkills, setLoadingSkills] = useState<
    ReadonlyArray<SkillLoadingState>
  >([]);
  const [loadedSkills, setLoadedSkills] = useState<
    ReadonlyArray<LoadedSkillContent>
  >([]);
  const processedMarkersRef = useRef(new Set<string>());

  const isLoadingSkill = loadingSkills.some((s) => s.status === "loading");

  /**
   * Fetch full skill content from the API
   */
  const fetchSkillContent = useCallback(
    async (skillName: string): Promise<LoadedSkillContent | null> => {
      try {
        const res = await fetch(
          `/api/skills/${encodeURIComponent(skillName)}?byName=true`,
        );
        if (!res.ok) return null;

        const data = await res.json();
        const skill = data.skill;
        if (!skill) return null;

        return {
          name: skill.name,
          display_name: skill.display_name,
          description: skill.description,
          skill_md: skill.skill_md,
        };
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Process AI response text:
   * 1. Detect LOAD_SKILL markers
   * 2. Strip markers from display text
   * 3. Trigger async skill loading
   */
  const processStreamText = useCallback(
    (text: string): string => {
      // Fast short-circuit: skip regex processing if no marker present
      if (!text.includes("[LOAD_SKILL:")) return text;

      const detectedNames = detectSkillLoadRequest(text);

      // Filter out already-processed markers
      const newNames = detectedNames.filter(
        (name) => !processedMarkersRef.current.has(name),
      );

      if (newNames.length > 0) {
        // Mark as processed to avoid duplicate loading
        for (const name of newNames) {
          processedMarkersRef.current.add(name);
        }

        // Update loading states
        setLoadingSkills((prev) => {
          const newStates: SkillLoadingState[] = newNames.map((name) => ({
            skillName: name,
            displayName: name, // Will be updated when loaded
            status: "loading" as const,
          }));
          return [...prev, ...newStates];
        });

        // Trigger async loading for each new skill
        for (const name of newNames) {
          void (async () => {
            const skill = await fetchSkillContent(name);

            if (skill) {
              setLoadedSkills((prev) => {
                const next = [...prev, skill];
                // Cap at 5 loaded skills; drop oldest when exceeding limit
                return next.length > 5 ? next.slice(next.length - 5) : next;
              });
              setLoadingSkills((prev) =>
                prev.map((s) =>
                  s.skillName === name
                    ? {
                        ...s,
                        displayName: skill.display_name,
                        status: "loaded" as const,
                      }
                    : s,
                ),
              );
            } else {
              setLoadingSkills((prev) =>
                prev.map((s) =>
                  s.skillName === name
                    ? {
                        ...s,
                        status: "error" as const,
                        error: "Skill not found",
                      }
                    : s,
                ),
              );
            }
          })();
        }
      }

      // Strip markers from display text
      return stripSkillLoadMarkers(text);
    },
    [fetchSkillContent],
  );

  const clearLoadingStates = useCallback(() => {
    setLoadingSkills([]);
    setLoadedSkills([]);
    processedMarkersRef.current.clear();
  }, []);

  return {
    loadingSkills,
    loadedSkills,
    isLoadingSkill,
    processStreamText,
    clearLoadingStates,
  };
}
