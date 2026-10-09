import React, { useState, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { LockKeyhole, ArrowRight, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { resetPassword } from '../services/auth'
import { AuthAtmosphere } from '../components/layout/AuthAtmosphere'
import { Logo } from '../components/ui/Logo'
import './Auth.css'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and a number')
      return
    }

    setLoading(true)
    try {
      await resetPassword({ token, ...form })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <AuthAtmosphere />
        <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}><Logo size="lg" /></Link>
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-heading">
            <h1>Invalid reset link</h1>
            <p>This password reset link is invalid or has expired.</p>
          </div>
          <Link to="/forgot-password" className="btn btn-secondary btn-full">Request a new link</Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="auth-page">
        <AuthAtmosphere />
        <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}><Logo size="lg" /></Link>
        <div className="auth-card" style={{ textAlign: 'center', gap: '20px' }}>
          <div className="auth-info-icon"><CheckCircle size={28} /></div>
          <div className="auth-heading">
            <h1>Password reset!</h1>
            <p>Your password has been changed. Redirecting to sign in...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <AuthAtmosphere />
      <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}><Logo size="lg" /></Link>
      <div className="auth-card">
        <div className="auth-icon"><LockKeyhole size={22} /></div>
        <div className="auth-heading">
          <h1>Set new password</h1>
          <p>Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="password">New Password</label>
            <div className="input-with-icon">
              <input
                id="password"
                className="form-input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                required
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
            disabled={loading}
          >
            {!loading && <>Reset password <ArrowRight size={15} /></>}
          </button>
        </form>

        <div className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
