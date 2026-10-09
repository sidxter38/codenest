import api from './api'

export interface User {
  id: string
  name: string
  username: string
  email: string
  avatarInitials: string
  emailVerified: boolean
  createdAt: string
}

export interface LoginResult {
  token: string
  user: User
}

export async function register(data: {
  name: string
  username: string
  email: string
  password: string
  confirmPassword: string
}): Promise<{ userId: string; email: string; message: string }> {
  const response = await api.post('/auth/sign-up', data)
  return response.data
}

export async function verifyOTP(email: string, otp: string): Promise<{ message: string }> {
  const response = await api.post('/auth/verify-otp', { email, otp })
  return response.data
}

export async function resendOTP(email: string): Promise<{ message: string }> {
  const response = await api.post('/auth/resend-otp', { email })
  return response.data
}

// Backwards-compatible verifyEmail
export async function verifyEmail(token: string): Promise<{ message: string }> {
  const response = await api.post('/auth/verify-email', { token })
  return response.data
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const response = await api.post('/auth/sign-in', { identifier, password })
  return response.data
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch {
    // Ignore network error on logout
  } finally {
    localStorage.removeItem('codenest_token')
    localStorage.removeItem('codenest_user')
  }
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await api.post('/auth/forgot-password', { email })
  return response.data
}

export async function resetPassword(data: {
  token: string
  password: string
  confirmPassword: string
}): Promise<{ message: string }> {
  const response = await api.post('/auth/reset-password', data)
  return response.data
}

export async function getMe(): Promise<User> {
  const response = await api.get('/auth/me')
  return response.data.user
}
