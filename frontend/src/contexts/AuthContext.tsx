import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User, login, logout, getMe } from '../services/auth'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const restoreSession = useCallback(async () => {
    const savedToken = localStorage.getItem('codenest_token')
    if (!savedToken) {
      setIsLoading(false)
      return
    }

    setToken(savedToken)

    try {
      const currentUser = await getMe()
      setUser(currentUser)
    } catch {
      // Token invalid or expired
      localStorage.removeItem('codenest_token')
      localStorage.removeItem('codenest_user')
      setToken(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  const signIn = async (identifier: string, password: string) => {
    const result = await login(identifier, password)
    localStorage.setItem('codenest_token', result.token)
    setToken(result.token)
    setUser(result.user)
  }

  const signOut = async () => {
    try {
      await logout()
    } catch {
      // Best effort
    } finally {
      localStorage.removeItem('codenest_token')
      localStorage.removeItem('codenest_user')
      setToken(null)
      setUser(null)
    }
  }

  const refreshUser = async () => {
    try {
      const currentUser = await getMe()
      setUser(currentUser)
    } catch {
      // Ignore
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        signIn,
        signOut,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
