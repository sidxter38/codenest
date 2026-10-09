import React, { useState, useEffect, useRef, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, ArrowRight, RotateCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { verifyOTP, resendOTP } from '../services/auth'
import { Logo } from '../components/ui/Logo'
import { AuthAtmosphere } from '../components/layout/AuthAtmosphere'
import './Auth.css'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initialEmail = params.get('email') || localStorage.getItem('pendingVerifyEmail') || ''
  const tokenParam = params.get('token') // Backwards compat

  const [email, setEmail] = useState(initialEmail)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [verified, setVerified] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Focus first input box on load
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  function handleDigitChange(index: number, value: string) {
    // Only accept numeric digit
    const cleaned = value.replace(/\D/g, '')
    if (!cleaned && value !== '') return

    const newDigits = [...otpDigits]
    newDigits[index] = cleaned ? cleaned[cleaned.length - 1] : ''
    setOtpDigits(newDigits)
    setError('')

    // Auto-advance to next input
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    const newDigits = [...otpDigits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setOtpDigits(newDigits)
    const nextIdx = Math.min(pasted.length, 5)
    inputRefs.current[nextIdx]?.focus()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const otp = otpDigits.join('')

    if (!email.trim()) {
      setError('Please provide your email address.')
      return
    }

    if (otp.length !== 6) {
      setError('Please enter all 6 digits of your verification code.')
      return
    }

    setLoading(true)
    try {
      const res = await verifyOTP(email.trim(), otp)
      setVerified(true)
      setSuccessMessage(res.message || 'Account activated successfully!')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending || !email.trim()) return
    setError('')
    setResending(true)
    try {
      const res = await resendOTP(email.trim())
      setSuccessMessage(res.message || 'New code sent to your email.')
      setCooldown(60)
      setOtpDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="auth-page">
      <AuthAtmosphere />
      <Link to="/" style={{ textDecoration: 'none', marginBottom: '24px' }}>
        <Logo size="lg" />
      </Link>

      <div className="auth-card" style={{ maxWidth: '440px' }}>
        <div className="auth-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
          {verified ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
        </div>

        <div className="auth-heading">
          <h1>{verified ? 'Email Verified' : 'Verify Your Email'}</h1>
          <p>
            {verified
              ? 'Your account is activated and ready to use.'
              : `Enter the 6-digit code sent to ${email || 'your email'}.`}
          </p>
        </div>

        {error && (
          <div className="auth-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && !error && (
          <div style={{
            background: 'var(--success-dim)',
            color: 'var(--success)',
            border: '1px solid rgba(76, 224, 179, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '13px',
            textAlign: 'center',
            marginBottom: '16px'
          }}>
            {successMessage}
          </div>
        )}

        {verified ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            <Link to="/signin" className="btn btn-primary btn-full">
              Sign In to Your Account <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" style={{ gap: '20px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="verify-email-input">Email Address</label>
              <input
                id="verify-email-input"
                className="form-input"
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  localStorage.setItem('pendingVerifyEmail', e.target.value)
                }}
                placeholder="name@company.com"
                required
              />
            </div>

            <div className="form-group" style={{ textAlign: 'center' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>6-Digit Code</label>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  margin: '6px 0 12px'
                }}
                onPaste={handlePaste}
              >
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { inputRefs.current[idx] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleKeyDown(idx, e)}
                    style={{
                      width: '48px',
                      height: '56px',
                      textAlign: 'center',
                      fontSize: '22px',
                      fontFamily: 'var(--font-code)',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'rgba(22, 36, 71, 0.9)',
                      border: digit ? '2px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      outline: 'none',
                      boxShadow: digit ? '0 0 12px rgba(122, 220, 240, 0.25)' : 'none',
                      transition: 'all 0.18s ease'
                    }}
                    id={`otp-digit-${idx}`}
                  />
                ))}
              </div>
            </div>

            <div style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'rgba(122, 220, 240, 0.08)',
              border: '1px dotted rgba(122, 220, 240, 0.25)',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: '14px',
              textAlign: 'center',
              lineHeight: '1.4'
            }}>
              💡 <b>Dev Notice:</b> If SMTP credentials are empty in <code>.env</code>, your 6-digit OTP code was printed in the backend terminal logs.
            </div>

            <button
              type="submit"
              className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
              disabled={loading || otpDigits.join('').length !== 6}
              id="verify-submit-btn"
            >
              Verify & Activate Account <ArrowRight size={16} />
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}>
              <span>Didn't receive code?</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                style={{
                  color: cooldown > 0 ? 'var(--text-subtle)' : 'var(--accent)',
                  fontWeight: 600,
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer'
                }}
                id="resend-otp-btn"
              >
                {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link to="/signin" className="auth-link">Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}
