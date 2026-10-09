import React, { Suspense, lazy, useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { CommandPalette } from './components/ui/CommandPalette'

// Lazy load pages for code splitting
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace'))
const CollaborativeWorkspace = lazy(() => import('./pages/CollaborativeWorkspace'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const Playground = lazy(() => import('./pages/Playground'))

export default function App() {
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
      }
    }

    function handleCustomOpen() {
      setCmdOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('codenest:open-palette', handleCustomOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('codenest:open-palette', handleCustomOpen)
    }
  }, [])

  return (
    <AuthProvider>
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<Login />} />
          <Route path="/signup" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Legacy route redirects */}
          <Route path="/sign-in" element={<Navigate to="/signin" replace />} />
          <Route path="/sign-up" element={<Navigate to="/signup" replace />} />
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/register" element={<Navigate to="/signup" replace />} />
          <Route path="/verify" element={<Navigate to="/verify-email" replace />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workspace/:code" element={<CollaborativeWorkspace />} />
            <Route path="/workspaces/:id" element={<CollaborativeWorkspace />} />
            <Route path="/projects/:id" element={<ProjectWorkspace />} />
            <Route path="/projects/:id/review/:reviewId" element={<ProjectWorkspace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
