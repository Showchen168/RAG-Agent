import { buildMarkdownFormatPrompt } from '@/lib/chat/structured-output'
import * as fs from 'fs'
import * as path from 'path'

describe('Chat route stream format (unit)', () => {
  it('uses buildMarkdownFormatPrompt instead of buildStructuredOutputPrompt', () => {
    const prompt = buildMarkdownFormatPrompt()
    expect(prompt).toContain('Markdown')
    expect(prompt).not.toContain('"response"')
  })

  it('route.ts no longer imports from @crayonai packages', async () => {
    const routeContent = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/chat/route.ts'),
      'utf-8'
    )
    expect(routeContent).not.toContain('@crayonai/stream')
    expect(routeContent).not.toContain('fromGeminiStream')
    expect(routeContent).not.toContain('buildStructuredOutputPrompt')
    expect(routeContent).toContain('buildMarkdownFormatPrompt')
    expect(routeContent).toContain('createUIMessageStreamResponse')
  })
})
