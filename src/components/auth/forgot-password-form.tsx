'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError('操作失敗，請稍後再試')
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-4 w-full max-w-sm text-center">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">
            如果此電子郵件已註冊，你將會收到密碼重設連結。
          </p>
          <p className="text-xs text-gray-500 mt-2">
            請檢查信箱（包括垃圾郵件資料夾）
          </p>
        </div>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          返回登入
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <p className="text-sm text-gray-500">
        輸入你的電子郵件地址，我們將寄送密碼重設連結給你。
      </p>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@example.com"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {loading ? '寄送中...' : '寄送重設連結'}
      </button>

      <p className="text-sm text-center text-gray-500">
        <Link href="/login" className="text-blue-600 hover:underline">
          返回登入
        </Link>
      </p>
    </form>
  )
}
