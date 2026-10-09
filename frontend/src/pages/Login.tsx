import React, { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LockKeyhole, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from '../components/ui/Logo'
import { AuthAtmosphere } from '../components/layout/AuthAtmosphere'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [notVerifiedEmail, setNotVerifiedEmail] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotVerifiedEmail(null)
    setLoading(true)
    try {
      await signIn(identifier, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const errRes = err as { response?: { data?: { error?: string; notVerified?: boolean; email?: string } } }
      if (errRes.response?.data?.notVerified) {
        setNotVerifiedEmail(errRes.response.data.email || identifier)
      }
      setError(errRes.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <AuthAtmosphere />
      <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}>
        <Logo size="lg" />
      </Link>

      <div className="auth-card">
        <div className="auth-icon">
          <LockKeyhole size={22} />
        </div>
        <div className="auth-heading">
          <h1>Welcome back.</h1>
          <p>Sign in to continue to your workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <div>{error}</div>
              {notVerifiedEmail && (
                <div style={{ marginTop: '8px' }}>
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(notVerifiedEmail)}`}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    Enter 6-Digit Verification Code →
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="identifier">Email or Username</label>
            <input
              id="identifier"
              className="form-input"
              type="text"
              placeholder="you@company.com"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <div className="auth-label-row">
              <label className="form-label" htmlFor="password">Password</label>
              <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>
            </div>
            <div className="input-with-icon">
              <input
                id="password"
                className="form-input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
            disabled={loading}
          >
            {!loading && <>Sign in <ArrowRight size={15} /></>}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account?{' '}
          <Link to="/signup">Create one</Link>
        </div>
      </div>
    </div>
  )
}
