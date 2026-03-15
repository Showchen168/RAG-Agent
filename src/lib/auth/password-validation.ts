export const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
} as const

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
  strength: 0 | 1 | 2 | 3 | 4
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`密碼至少需要 ${PASSWORD_RULES.minLength} 個字元`)
  }
  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('需包含至少 1 個大寫英文字母')
  }
  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('需包含至少 1 個小寫英文字母')
  }
  if (PASSWORD_RULES.requireNumber && !/\d/.test(password)) {
    errors.push('需包含至少 1 個數字')
  }

  const passedRules = 4 - errors.length
  const lengthBonus = password.length >= 12 ? 1 : 0
  const strength = password.length === 0
    ? 0
    : Math.min(4, passedRules + lengthBonus) as 0 | 1 | 2 | 3 | 4

  return { isValid: errors.length === 0, errors, strength }
}

export function getStrengthLabel(strength: number): { text: string; color: string } {
  switch (strength) {
    case 1: return { text: '弱', color: 'text-red-500' }
    case 2: return { text: '中等', color: 'text-yellow-500' }
    case 3: return { text: '強', color: 'text-green-500' }
    case 4: return { text: '非常強', color: 'text-emerald-600' }
    default: return { text: '', color: '' }
  }
}
