import React, { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowRight, CheckCircle } from 'lucide-react'
import { forgotPassword } from '../services/auth'
import { AuthAtmosphere } from '../components/layout/AuthAtmosphere'
import { Logo } from '../components/ui/Logo'
import './Auth.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-page">
        <AuthAtmosphere />
        <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}><Logo size="lg" /></Link>
        <div className="auth-card" style={{ textAlign: 'center', gap: '20px' }}>
          <div className="auth-info-icon"><CheckCircle size={28} /></div>
          <div className="auth-heading">
            <h1>Check your email</h1>
            <p>If an account exists for <strong>{email}</strong>, we sent a password reset link.</p>
          </div>
          <Link to="/login" className="btn btn-secondary btn-full">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <AuthAtmosphere />
      <Link to="/" style={{ textDecoration: 'none', marginBottom: '20px' }}><Logo size="lg" /></Link>
      <div className="auth-card">
        <div className="auth-icon">
          <Mail size={22} />
        </div>
        <div className="auth-heading">
          <h1>Reset your password</h1>
          <p>Enter your email and we'll send a secure reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <input
              id="email"
              className="form-input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
            disabled={loading}
          >
            {!loading && <>Send reset link <ArrowRight size={15} /></>}
          </button>
        </form>

        <div className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
