export interface SourceRef {
  title: string;
  type?: string;
}

/** 清除文字中的 [[Citation:...]] 標記 */
export function stripInlineCitations(text: string): string {
  return text.replace(/\s*\[\[Citation:\s*.*?\]\]/g, "");
}

export function extractInlineCitationSources(text: string): SourceRef[] {
  const matches = [...text.matchAll(/\[\[Citation:\s*(.*?)\]\]/g)];
  const seen = new Set<string>();
  const sources: SourceRef[] = [];

  for (const m of matches) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    sources.push({ title: raw, type: "引用文件" });
  }

  return sources;
}

export function mergeSources(
  explicitSources: SourceRef[],
  citationSources: SourceRef[],
): SourceRef[] {
  const merged: SourceRef[] = [];
  const seen = new Set<string>();

  for (const source of [...explicitSources, ...citationSources]) {
    const key = source.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }

  return merged;
}
