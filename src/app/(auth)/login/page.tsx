import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">NexusMind</h1>
        <p className="text-gray-500 mb-8">AI 智慧知識助手</p>
        <LoginForm />
      </div>
    </div>
  )
}
