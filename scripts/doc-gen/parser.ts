import { Project, SyntaxKind, type SourceFile, type FunctionDeclaration } from 'ts-morph'
import type { ParsedMethod, ParsedParam } from './types'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

/**
 * 用 ts-morph AST 解析單一 route.ts，
 * 回傳該檔案導出的 HTTP 方法資訊
 */
export function parseRouteFile(filePath: string): ParsedMethod[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true })
  const sourceFile = project.addSourceFileAtPath(filePath)
  const methods: ParsedMethod[] = []

  for (const method of HTTP_METHODS) {
    const fn = findExportedFunction(sourceFile, method)
    if (!fn) continue

    const description = extractDescription(sourceFile, fn, method)
    const params = extractUrlParams(fn)
    const requestBody = extractRequestBody(fn)
    const auth = detectAuth(fn)
    const streaming = detectStreaming(fn)
    const maxDuration = extractMaxDuration(sourceFile)

    methods.push({
      method,
      description,
      params,
      requestBody,
      auth,
      streaming,
      ...(maxDuration !== undefined && { maxDuration }),
    })
  }

  return methods
}

/** 找到 export function GET / export async function POST 等 */
function findExportedFunction(
  sf: SourceFile,
  method: string,
): FunctionDeclaration | undefined {
  // 1. named export function
  const named = sf.getFunction(method)
  if (named?.isExported()) return named

  // 2. variable declaration: export const GET = async (req) => ...
  //    回傳 undefined（暫不支援 arrow function 解析）
  return undefined
}

// Extract function description from JSDoc, inline comments, or file-level JSDoc
function extractDescription(
  sf: SourceFile,
  fn: FunctionDeclaration,
  method: string,
): string {
  // JSDoc on function
  const jsDocs = fn.getJsDocs()
  if (jsDocs.length > 0) {
    return jsDocs[0].getDescription().trim()
  }

  // inline comment above function
  const leadingComments = fn.getLeadingCommentRanges()
  for (const c of leadingComments) {
    const text = c.getText()
    // 匹配 // GET: xxx 或 // POST: xxx
    const match = text.match(new RegExp(`//\\s*${method}[:\\s]+(.+)`))
    if (match) return match[1].trim()
  }

  // fallback: file-level JSDoc
  const fileJsDocs = sf.getStatements()
    .filter((s) => s.getKind() === SyntaxKind.JSDoc)
  if (fileJsDocs.length > 0) {
    const text = fileJsDocs[0].getText()
    const cleaned = text.replace(/\/\*\*|\*\/|\n\s*\*/g, ' ').trim()
    return cleaned
  }

  // 嘗試掃描檔案頂部的 JSDoc comment
  const firstStatement = sf.getStatements()[0]
  if (firstStatement) {
    const leading = firstStatement.getLeadingCommentRanges()
    for (const c of leading) {
      const text = c.getText()
      if (text.startsWith('/**')) {
        return text.replace(/\/\*\*|\*\/|\n\s*\*\s?/g, ' ').trim()
      }
    }
  }

  return ''
}

/** 從函式參數或 searchParams 偵測 URL query 參數 */
function extractUrlParams(fn: FunctionDeclaration): ParsedParam[] {
  const params: ParsedParam[] = []
  const body = fn.getBody()?.getText() ?? ''

  // 匹配 searchParams.get('xxx') 或 url.searchParams.get('xxx')
  const spMatches = body.matchAll(/searchParams\.get\(['"](\w+)['"]\)/g)
  for (const m of spMatches) {
    params.push({
      name: m[1],
      type: 'string',
      required: false,
      description: '',
    })
  }

  // 匹配 params.xxx（dynamic route 參數）
  const dynamicMatches = body.matchAll(/params\.(\w+)/g)
  const seen = new Set(params.map((p) => p.name))
  for (const m of dynamicMatches) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      params.push({
        name: m[1],
        type: 'string',
        required: true,
        description: 'Path parameter',
      })
    }
  }

  return params
}

/** 從 req.json() as { ... } 或 Zod schema 偵測 request body 參數 */
function extractRequestBody(fn: FunctionDeclaration): ParsedParam[] {
  const params: ParsedParam[] = []
  const body = fn.getBody()?.getText() ?? ''

  // Pattern 1: req.json() as { title: string; content: string; tags?: string[] }
  const asMatch = body.match(/req\.json\(\)\s*as\s*\{([^}]+)\}/)
  if (asMatch) {
    return parseInlineType(asMatch[1])
  }

  // Pattern 2: destructuring — const { title, content } = await req.json()
  const destructMatch = body.match(/const\s*\{([^}]+)\}\s*=\s*await\s+req\.json\(\)/)
  if (destructMatch) {
    const names = destructMatch[1].split(',').map((s) => s.trim().split(':')[0].trim())
    for (const name of names) {
      if (name) {
        params.push({ name, type: 'unknown', required: true, description: '' })
      }
    }
    return params
  }

  // Pattern 3: body = await req.json() + Zod parse
  if (body.includes('req.json()') && body.includes('.safeParse(')) {
    params.push({ name: '(Zod schema)', type: 'object', required: true, description: 'Validated by Zod schema' })
  }

  return params
}

/** 解析 inline type annotation 字串 → ParsedParam[] */
function parseInlineType(raw: string): ParsedParam[] {
  const params: ParsedParam[] = []
  // 分號或換行分割
  const fields = raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)

  for (const field of fields) {
    // title?: string  or  content: string
    const m = field.match(/^(\w+)(\?)?:\s*(.+)$/)
    if (m) {
      params.push({
        name: m[1],
        type: m[3].replace(/,\s*$/, '').trim(),
        required: !m[2],
        description: '',
      })
    }
  }
  return params
}

/** 偵測是否使用 Supabase auth 或其他認證 */
function detectAuth(fn: FunctionDeclaration): boolean {
  const body = fn.getBody()?.getText() ?? ''
  return (
    body.includes('.auth.getUser()') ||
    body.includes('getServerSession') ||
    body.includes('auth()') ||
    // webhook secret 驗證也算
    body.includes('x-telegram-bot-api-secret-token')
  )
}

/** 偵測是否使用 streaming 回應 */
function detectStreaming(fn: FunctionDeclaration): boolean {
  const body = fn.getBody()?.getText() ?? ''
  return (
    body.includes('streamText') ||
    body.includes('StreamingTextResponse') ||
    body.includes('createUIMessageStream') ||
    body.includes('ReadableStream')
  )
}

/** 擷取 export const maxDuration = N */
function extractMaxDuration(sf: SourceFile): number | undefined {
  for (const decl of sf.getVariableDeclarations()) {
    if (decl.getName() === 'maxDuration' && decl.isExported()) {
      const init = decl.getInitializer()
      if (init) {
        const val = Number(init.getText())
        if (!isNaN(val)) return val
      }
    }
  }
  return undefined
}
