const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': '電子郵件或密碼不正確',
  'Email not confirmed': '電子郵件尚未驗證，請檢查信箱',
  'Invalid Refresh Token: Refresh Token Not Found': '登入已過期，請重新登入',
  'User already registered': '此電子郵件已被註冊',
  'Password should be at least 6 characters': '密碼不符合安全要求',
  'Signup requires a valid password': '請輸入有效的密碼',
  'For security purposes, you can only request this after': '操作過於頻繁，請稍後再試',
  'New password should be different from the old password': '新密碼不能與舊密碼相同',
  'Request timeout': '請求逾時，請稍後再試',
}

export function sanitizeAuthError(errorMessage: string): string {
  if (AUTH_ERROR_MAP[errorMessage]) {
    return AUTH_ERROR_MAP[errorMessage]
  }

  for (const [key, value] of Object.entries(AUTH_ERROR_MAP)) {
    if (errorMessage.includes(key)) {
      return value
    }
  }

  return '操作失敗，請稍後再試'
}
