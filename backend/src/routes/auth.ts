import { Router, Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import {
  registerUser,
  verifyOTP,
  resendOTP,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword
} from '../services/auth'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// ─── Sign Up (Register) ──────────────────────────────────────────────────────
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 alphanumeric characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match')
    return true
  })
]

async function handleRegister(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() })
    return
  }

  try {
    const result = await registerUser({
      name: req.body.name,
      username: req.body.username,
      email: req.body.email,
      password: req.body.password
    })
    res.status(201).json({
      message: 'Account created. We sent a 6-digit verification code to your email.',
      email: result.email,
      userId: result.id,
      resend: result.resend
    })
  } catch (err: unknown) {
    const error = err as Error
    if (error.message === 'EMAIL_TAKEN') {
      res.status(409).json({ error: 'An account with this email already exists' })
    } else if (error.message === 'USERNAME_TAKEN') {
      res.status(409).json({ error: 'This username is already taken' })
    } else {
      console.error('[Auth] Register error:', error)
      res.status(500).json({ error: 'Registration failed. Please try again.' })
    }
  }
}

router.post('/sign-up', registerValidation, handleRegister)
router.post('/register', registerValidation, handleRegister)

// ─── Verify 6-Digit OTP ──────────────────────────────────────────────────────
const verifyOTPValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('6-digit OTP code required')
]

async function handleVerifyOTP(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() })
    return
  }

  try {
    const result = await verifyOTP(req.body.email, req.body.otp)
    if (result.alreadyVerified) {
      res.json({ message: 'Account is already verified. You can sign in.' })
      return
    }
    res.json({ message: 'Email verified successfully. You can now sign in.' })
  } catch (err: unknown) {
    const error = err as Error
    if (error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ error: 'Account not found with this email' })
    } else if (error.message === 'NO_ACTIVE_OTP') {
      res.status(400).json({ error: 'No active verification code found. Please request a new code.' })
    } else if (error.message === 'MAX_ATTEMPTS_EXCEEDED') {
      res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' })
    } else if (error.message === 'OTP_EXPIRED') {
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' })
    } else if (error.message.startsWith('INVALID_OTP')) {
      const remaining = error.message.split(':')[1]
      res.status(400).json({ error: `Incorrect verification code. ${remaining} attempts remaining.` })
    } else {
      console.error('[Auth] Verify error:', error)
      res.status(500).json({ error: 'Verification failed. Please try again.' })
    }
  }
}

router.post('/verify-otp', verifyOTPValidation, handleVerifyOTP)
router.post('/verify-email', verifyOTPValidation, handleVerifyOTP)

// ─── Resend OTP ─────────────────────────────────────────────────────────────
router.post(
  '/resend-otp',
  [body('email').isEmail().normalizeEmail().withMessage('Valid email required')],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      await resendOTP(req.body.email)
      res.json({ message: 'A new 6-digit verification code has been sent to your email.' })
    } catch (err: unknown) {
      const error = err as Error
      if (error.message === 'USER_NOT_FOUND') {
        res.status(404).json({ error: 'Account not found with this email' })
      } else if (error.message === 'ALREADY_VERIFIED') {
        res.status(400).json({ error: 'Account is already verified. Please sign in.' })
      } else if (error.message.startsWith('COOLDOWN_ACTIVE')) {
        const wait = error.message.split(':')[1]
        res.status(429).json({ error: `Please wait ${wait}s before requesting a new code.` })
      } else {
        res.status(500).json({ error: 'Failed to resend verification code.' })
      }
    }
  }
)

// ─── Sign In (Login) ─────────────────────────────────────────────────────────
const loginValidation = [
  body('identifier').trim().notEmpty().withMessage('Email or username required'),
  body('password').notEmpty().withMessage('Password required')
]

async function handleLogin(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() })
    return
  }

  try {
    const result = await loginUser(req.body.identifier, req.body.password)
    res.json(result)
  } catch (err: unknown) {
    const error = err as Error
    if (error.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid email/username or password' })
    } else if (error.message === 'EMAIL_NOT_VERIFIED') {
      res.status(403).json({
        error: 'Please verify your email before signing in.',
        notVerified: true,
        email: req.body.identifier
      })
    } else {
      console.error('[Auth] Login error:', error)
      res.status(500).json({ error: 'Login failed. Please try again.' })
    }
  }
}

router.post('/sign-in', loginValidation, handleLogin)
router.post('/login', loginValidation, handleLogin)

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.substring(7) || ''
    await logoutUser(token)
    res.json({ message: 'Logged out successfully' })
  } catch {
    res.status(500).json({ error: 'Logout failed' })
  }
})

// ─── Forgot Password ─────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req: Request, res: Response): Promise<void> => {
    try {
      await requestPasswordReset(req.body.email)
      res.json({ message: 'If an account exists with that email, a reset link has been sent.' })
    } catch {
      res.status(500).json({ error: 'Request failed. Please try again.' })
    }
  }
)

// ─── Reset Password ──────────────────────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('token').isString().notEmpty(),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match')
      return true
    })
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      await resetPassword(req.body.token, req.body.password)
      res.json({ message: 'Password reset successfully. You can now sign in.' })
    } catch (err: unknown) {
      const error = err as Error
      if (['INVALID_TOKEN', 'TOKEN_USED', 'TOKEN_EXPIRED'].includes(error.message)) {
        res.status(400).json({ error: 'Invalid or expired reset link' })
      } else {
        res.status(500).json({ error: 'Reset failed. Please try again.' })
      }
    }
  }
)

// ─── Get Current User ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ user: req.user })
})

export default router
