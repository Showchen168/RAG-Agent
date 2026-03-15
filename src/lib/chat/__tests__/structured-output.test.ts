import { buildMarkdownFormatPrompt } from '../structured-output'

describe('buildMarkdownFormatPrompt', () => {
  it('returns a string containing markdown formatting instructions', () => {
    const prompt = buildMarkdownFormatPrompt()
    expect(prompt).toContain('Markdown')
    expect(prompt).not.toContain('"response"')
    expect(prompt).not.toContain('oneOf')
  })

  it('includes language matching instruction', () => {
    const prompt = buildMarkdownFormatPrompt()
    expect(prompt).toContain('語言')
  })

  it('returns a non-empty string', () => {
    const prompt = buildMarkdownFormatPrompt()
    expect(prompt.trim().length).toBeGreaterThan(50)
  })
})
