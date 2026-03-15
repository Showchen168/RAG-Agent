'use client'

import { validatePassword, getStrengthLabel } from '@/lib/auth/password-validation'

interface PasswordStrengthProps {
  password: string
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { errors, strength } = validatePassword(password)
  const label = getStrengthLabel(strength)

  if (password.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              level <= strength
                ? strength <= 1 ? 'bg-red-500'
                  : strength === 2 ? 'bg-yellow-500'
                  : 'bg-green-500'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>

      {label.text && (
        <p className={`text-xs font-medium ${label.color}`}>{label.text}</p>
      )}

      {errors.length > 0 && (
        <ul className="space-y-0.5">
          {errors.map((err) => (
            <li key={err} className="text-xs text-red-500">{err}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
