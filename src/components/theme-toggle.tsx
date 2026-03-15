"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";

const modes = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Laptop, label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 防止 Hydration mismatch
  if (!mounted) {
    return (
      <div className="h-9 w-[110px] rounded-full border border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-900/70 md:w-[220px]" />
    );
  }

  const active = theme ?? resolvedTheme ?? "system";

  return (
    <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white/70 p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => setTheme(mode.value)}
          title={mode.label}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 transition-all",
            active === mode.value
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
          )}
        >
          <mode.icon size={14} />
          <span className="hidden text-[10px] font-medium lg:inline-block">
            {mode.label}
          </span>
        </button>
      ))}
    </div>
  );
}
