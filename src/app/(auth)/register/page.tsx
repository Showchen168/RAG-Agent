import { RegisterForm } from '@/components/auth/register-form'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">NexusMind</h1>
        <p className="text-gray-500 mb-8">建立你的帳號</p>
        <RegisterForm />
      </div>
    </div>
  )
}
