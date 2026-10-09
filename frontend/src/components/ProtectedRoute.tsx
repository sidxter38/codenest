import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingScreen } from './ui/LoadingScreen'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <Outlet />
}
