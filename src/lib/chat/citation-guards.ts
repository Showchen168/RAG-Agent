export function extractFreshnessAnchors(query: string): string[] {
  const anchors = new Set<string>()
  const normalized = query.toUpperCase()
  const eventKeywords = ['CES', 'COMPUTEX', 'MWC', 'GTC', 'WWDC', 'GITEX', 'WEB SUMMIT']

  for (const keyword of eventKeywords) {
    if (normalized.includes(keyword)) anchors.add(keyword)
  }

  const years = query.match(/20\d{2}/g) ?? []
  for (const year of years) anchors.add(year)

  return [...anchors]
}

export function docMatchesFreshnessAnchors(params: {
  title: string
  tags: string[]
  chunks: string[]
  anchors: string[]
}): boolean {
  const { title, tags, chunks, anchors } = params
  if (anchors.length === 0) return true

  const docText = `${title}\n${tags.join(' ')}\n${chunks.join('\n')}`.toUpperCase()
  const eventAnchors = anchors.filter((a) => /[A-Z]/.test(a))
  const yearAnchors = anchors.filter((a) => /^\d{4}$/.test(a))

  const hasEventMatch = eventAnchors.length === 0 || eventAnchors.some((a) => docText.includes(a))
  const hasYearMatch = yearAnchors.length === 0 || yearAnchors.some((a) => docText.includes(a))

  return hasEventMatch && hasYearMatch
}
