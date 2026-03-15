import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">NexusMind</h1>
        <p className="text-gray-500 mb-8">重設密碼</p>
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
