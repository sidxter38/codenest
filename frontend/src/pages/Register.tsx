import React, { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, ArrowRight, Eye, EyeOff, Check, X } from 'lucide-react'
import { register } from '../services/auth'
import { Logo } from '../components/ui/Logo'
import { AuthAtmosphere } from '../components/layout/AuthAtmosphere'
import './Auth.css'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) }
  ]

  if (!password) return null

  return (
    <div className="password-checks">
      {checks.map(c => (
        <span key={c.label} className={c.ok ? 'check-ok' : 'check-fail'}>
          {c.ok ? <Check size={11} /> : <X size={11} />} {c.label}
        </span>
      ))}
    </div>
  )
}

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' })
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors(er => ({ ...er, [key]: '' }))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.name.trim() || form.name.length < 2) errs.name = 'Name must be at least 2 characters'
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(form.username)) errs.username = '3-30 alphanumeric characters only'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Valid email required'
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
      errs.password = 'Password requirements not met'
    }
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    return errs
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      await register({
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword
      })
      localStorage.setItem('pendingVerifyEmail', form.email)
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; errors?: Array<{ msg?: string }> } }; message?: string }
      const serverMsg = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg
      const networkMsg = error.message && error.message.includes('Network Error') ? 'Cannot connect to backend server. Please check your internet or try again.' : undefined
      setError(serverMsg || networkMsg || 'Registration failed. Please try again.')
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
          <Users size={22} />
        </div>
        <div className="auth-heading">
          <h1>Start building together.</h1>
          <p>Create your Code<span className="codenest-animated-nest">Nest</span> workspace in a few seconds.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                className={`form-input ${errors.name ? 'error' : ''}`}
                type="text"
                placeholder="Maya Lee"
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
                required
              />
              {errors.name && <span className="form-error">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                className={`form-input ${errors.username ? 'error' : ''}`}
                type="text"
                placeholder="maya"
                value={form.username}
                onChange={set('username')}
                autoComplete="username"
                required
              />
              {errors.username && <span className="form-error">{errors.username}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              className={`form-input ${errors.email ? 'error' : ''}`}
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              required
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="input-with-icon">
              <input
                id="password"
                className={`form-input ${errors.password ? 'error' : ''}`}
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
            <PasswordStrength password={form.password} />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
              required
            />
            {errors.confirmPassword && <span className="form-error">{errors.confirmPassword}</span>}
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
            disabled={loading}
          >
            {!loading && <>Create account <ArrowRight size={15} /></>}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account?{' '}
          <Link to="/signin">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
