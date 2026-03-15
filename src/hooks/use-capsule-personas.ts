/**
 * useCapsulePersonas — 膠囊 AI 角色 Hook
 * 消費 /api/prompts?scope=chat（與設定頁「AI 角色商城」同源）
 */

import { useState, useEffect, useCallback } from "react";
import type { Persona } from "@/lib/crayon/prompts";

/** 膠囊用 Persona（包含 isOwned 用於判斷是否可刪除） */
export type CapsulePersona = Persona & { readonly isOwned: boolean };

interface UseCapsulePersonasReturn {
  readonly personas: readonly CapsulePersona[];
  readonly selectedPersona: CapsulePersona | null;
  readonly isLoading: boolean;
  readonly selectPersona: (personaId: string) => void;
  readonly removePersona: (personaId: string) => Promise<boolean>;
}

interface DbTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly icon: string;
  readonly system_prompt: string;
  readonly user_id: string | null;
}

function templateToPersona(t: DbTemplate): CapsulePersona {
  return {
    id: t.id,
    name: t.name,
    description: t.description || "",
    icon: t.icon || "Bot",
    systemPrompt: t.system_prompt,
    isOwned: t.user_id !== null,
  };
}

export function useCapsulePersonas(): UseCapsulePersonasReturn {
  const [personas, setPersonas] = useState<readonly CapsulePersona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts?scope=chat", {
        credentials: "include",
      });
      if (!res.ok) {
        setPersonas([]);
        return;
      }
      const json = await res.json();
      if (Array.isArray(json.templates)) {
        setPersonas(json.templates.map(templateToPersona));
      }
    } catch {
      setPersonas([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  // 監聽設定頁的角色 CRUD 事件（PromptMarketplace 觸發）
  useEffect(() => {
    const handler = () => fetchPersonas();
    window.addEventListener("personas-updated", handler);
    return () => window.removeEventListener("personas-updated", handler);
  }, [fetchPersonas]);

  const selectPersona = useCallback((personaId: string) => {
    // 空字串 = 強制取消選擇
    if (personaId === "") {
      setSelectedPersonaId(null);
      return;
    }
    // toggle：再次點擊取消選擇
    setSelectedPersonaId((prev) => (prev === personaId ? null : personaId));
  }, []);

  const removePersona = useCallback(
    async (personaId: string) => {
      try {
        const res = await fetch(`/api/prompts/${personaId}`, {
          method: "DELETE",
        });
        if (!res.ok) return false;
        // 樂觀更新 + 通知其他 listener
        setPersonas((prev) => prev.filter((p) => p.id !== personaId));
        if (selectedPersonaId === personaId) {
          setSelectedPersonaId(null);
        }
        window.dispatchEvent(new CustomEvent("personas-updated"));
        return true;
      } catch {
        return false;
      }
    },
    [selectedPersonaId],
  );

  const selectedPersona =
    personas.find((p) => p.id === selectedPersonaId) ?? null;

  return { personas, selectedPersona, isLoading, selectPersona, removePersona };
}
