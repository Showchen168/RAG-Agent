import {
  skillConfigSchema,
  skillInputConfigSchema,
  skillOutputConfigSchema,
  skillRuntimeConfigSchema,
  SKILL_CATEGORIES,
  SKILL_INPUT_TYPES,
  SKILL_PREVIEW_FORMATS,
  MAX_ZIP_SIZE,
} from '../schemas'

describe('skillConfigSchema', () => {
  const validConfig = {
    name: 'test-skill',
    displayName: 'Test Skill',
    description: 'A test skill for unit testing',
    icon: 'Zap',
    category: 'utility',
    input: {
      type: 'context',
    },
    output: {
      fileType: 'md',
      mimeType: 'text/markdown',
      previewFormat: 'markdown',
    },
    runtime: {
      baseImage: 'node:20-slim',
      timeout: 60,
      maxMemory: '512m',
    },
  }

  it('should accept a valid skill config', () => {
    const result = skillConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  it('should accept config with version field', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      version: '2.1.0',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.version).toBe('2.1.0')
    }
  })

  it('should accept config with userInputLabel when input type is "user"', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      input: {
        type: 'user',
        userInputLabel: 'Enter your prompt',
      },
    })
    expect(result.success).toBe(true)
  })

  it('should accept config with input type "both"', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      input: {
        type: 'both',
        userInputLabel: 'Additional input',
      },
    })
    expect(result.success).toBe(true)
  })

  it('should reject config with missing name', () => {
    const { name: _name, ...configWithoutName } = validConfig
    void _name
    const result = skillConfigSchema.safeParse(configWithoutName)
    expect(result.success).toBe(false)
  })

  it('should reject config with missing displayName', () => {
    const { displayName: _dn, ...configWithout } = validConfig
    void _dn
    const result = skillConfigSchema.safeParse(configWithout)
    expect(result.success).toBe(false)
  })

  it('should reject config with invalid category', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      category: 'invalid-category',
    })
    expect(result.success).toBe(false)
  })

  it('should reject config with invalid input type', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      input: { type: 'invalid' },
    })
    expect(result.success).toBe(false)
  })

  it('should reject config with missing output section', () => {
    const { output: _out, ...configWithout } = validConfig
    void _out
    const result = skillConfigSchema.safeParse(configWithout)
    expect(result.success).toBe(false)
  })

  it('should reject config with missing runtime section', () => {
    const { runtime: _rt, ...configWithout } = validConfig
    void _rt
    const result = skillConfigSchema.safeParse(configWithout)
    expect(result.success).toBe(false)
  })

  it('should reject config with empty name', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('should reject config with negative timeout', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      runtime: {
        ...validConfig.runtime,
        timeout: -1,
      },
    })
    expect(result.success).toBe(false)
  })

  it('should reject config with timeout exceeding 300', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      runtime: {
        ...validConfig.runtime,
        timeout: 301,
      },
    })
    expect(result.success).toBe(false)
  })

  it('should use default values for runtime when not provided', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      runtime: {
        baseImage: 'node:20-slim',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.runtime.timeout).toBe(60)
      expect(result.data.runtime.maxMemory).toBe('512m')
    }
  })

  it('should reject name with path traversal characters', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      name: '../evil-skill',
    })
    expect(result.success).toBe(false)
  })

  it('should reject name with spaces', () => {
    const result = skillConfigSchema.safeParse({
      ...validConfig,
      name: 'my skill',
    })
    expect(result.success).toBe(false)
  })
})

describe('skillInputConfigSchema', () => {
  it('should accept context type without label', () => {
    const result = skillInputConfigSchema.safeParse({ type: 'context' })
    expect(result.success).toBe(true)
  })

  it('should accept user type with label', () => {
    const result = skillInputConfigSchema.safeParse({
      type: 'user',
      userInputLabel: 'Enter text',
    })
    expect(result.success).toBe(true)
  })
})

describe('skillOutputConfigSchema', () => {
  it('should accept valid output config', () => {
    const result = skillOutputConfigSchema.safeParse({
      fileType: 'pdf',
      mimeType: 'application/pdf',
      previewFormat: 'plaintext',
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty fileType', () => {
    const result = skillOutputConfigSchema.safeParse({
      fileType: '',
      mimeType: 'text/plain',
      previewFormat: 'plaintext',
    })
    expect(result.success).toBe(false)
  })
})

describe('skillRuntimeConfigSchema', () => {
  it('should accept valid runtime config', () => {
    const result = skillRuntimeConfigSchema.safeParse({
      baseImage: 'python:3.11-slim',
      timeout: 120,
      maxMemory: '1g',
    })
    expect(result.success).toBe(true)
  })

  it('should use defaults for optional fields', () => {
    const result = skillRuntimeConfigSchema.safeParse({
      baseImage: 'node:20-slim',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.timeout).toBe(60)
      expect(result.data.maxMemory).toBe('512m')
    }
  })
})

describe('Constants', () => {
  it('should export valid categories', () => {
    expect(SKILL_CATEGORIES).toEqual(['document', 'data', 'creative', 'utility'])
  })

  it('should export valid input types', () => {
    expect(SKILL_INPUT_TYPES).toEqual(['context', 'user', 'both'])
  })

  it('should export valid preview formats', () => {
    expect(SKILL_PREVIEW_FORMATS).toEqual(['markdown', 'plaintext', 'image'])
  })

  it('should export MAX_ZIP_SIZE as 10MB', () => {
    expect(MAX_ZIP_SIZE).toBe(10 * 1024 * 1024)
  })
})
