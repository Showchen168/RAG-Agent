import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">NexusMind</h1>
        <p className="text-gray-500 mb-8">設定新密碼</p>
        <ResetPasswordForm />
      </div>
    </div>
  )
}
