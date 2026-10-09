import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from '../config/database'
import { sendOTPEmail, sendPasswordResetEmail } from './email'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production'
const SESSION_DURATION_DAYS = 30
const OTP_EXPIRY_MINUTES = 10
const MAX_VERIFICATION_ATTEMPTS = 5

function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex')
}

function generate6DigitOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Register a new user and generate a 6-digit OTP sent via email
 */
export async function registerUser(data: {
  name: string
  username: string
  email: string
  password: string
}) {
  const normalizedEmail = data.email.toLowerCase().trim()
  const normalizedUsername = data.username.toLowerCase().trim()

  // Check uniqueness
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }]
    }
  })

  if (existing) {
    if (existing.email === normalizedEmail) {
      // If user exists but is not verified, allow resending OTP
      if (!existing.emailVerified) {
        await createAndSendOTP(existing.id, existing.email, existing.name)
        return { id: existing.id, email: existing.email, name: existing.name, resend: true }
      }
      throw new Error('EMAIL_TAKEN')
    }
    throw new Error('USERNAME_TAKEN')
  }

  const passwordHash = await bcrypt.hash(data.password, 12)
  const initials = data.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() || '')
    .join('')

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      avatarInitials: initials,
      emailVerified: false
    }
  })

  // Generate and send 6-digit OTP
  await createAndSendOTP(user.id, user.email, user.name)

  return { id: user.id, email: user.email, name: user.name, resend: false }
}

/**
 * Helper to generate, hash, persist, and dispatch OTP
 */
async function createAndSendOTP(userId: string, email: string, name: string) {
  // Invalidate any existing unused OTP tokens for this user
  await prisma.verificationToken.updateMany({
    where: { userId, used: false },
    data: { used: true }
  })

  const otp = generate6DigitOTP()
  const otpHash = hashOTP(otp)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  console.log(`\n===========================================================`)
  console.log(`🔑 [CodeNest OTP] Code for ${email}: >>> ${otp} <<<`)
  console.log(`===========================================================\n`)

  await prisma.verificationToken.create({
    data: {
      userId,
      otpHash,
      type: 'EMAIL_VERIFICATION',
      attempts: 0,
      expiresAt,
      used: false
    }
  })

  // Dispatch via Nodemailer
  await sendOTPEmail(email, name, otp)
}

/**
 * Verify 6-digit OTP and activate account
 */
export async function verifyOTP(email: string, otp: string) {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  if (user.emailVerified) {
    return { alreadyVerified: true }
  }

  const tokenRecord = await prisma.verificationToken.findFirst({
    where: {
      userId: user.id,
      used: false,
      type: 'EMAIL_VERIFICATION'
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!tokenRecord) {
    throw new Error('NO_ACTIVE_OTP')
  }

  // Check attempts
  if (tokenRecord.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    })
    throw new Error('MAX_ATTEMPTS_EXCEEDED')
  }

  // Check expiration
  if (tokenRecord.expiresAt < new Date()) {
    await prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    })
    throw new Error('OTP_EXPIRED')
  }

  // Validate OTP
  const inputHash = hashOTP(otp)
  if (tokenRecord.otpHash !== inputHash) {
    await prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { attempts: { increment: 1 } }
    })
    const remaining = MAX_VERIFICATION_ATTEMPTS - (tokenRecord.attempts + 1)
    throw new Error(`INVALID_OTP:${remaining}`)
  }

  // Valid OTP: activate user and mark token used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true }
    }),
    prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    })
  ])

  return { success: true }
}

/**
 * Resend OTP with cooldown guard
 */
export async function resendOTP(email: string) {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  if (user.emailVerified) {
    throw new Error('ALREADY_VERIFIED')
  }

  // Check recent token cooldown (60 seconds)
  const recent = await prisma.verificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  })

  if (recent) {
    const elapsedSeconds = (Date.now() - new Date(recent.createdAt).getTime()) / 1000
    if (elapsedSeconds < 60) {
      const waitSeconds = Math.ceil(60 - elapsedSeconds)
      throw new Error(`COOLDOWN_ACTIVE:${waitSeconds}`)
    }
  }

  await createAndSendOTP(user.id, user.email, user.name)
  return { success: true }
}

/**
 * User login by email or username
 */
export async function loginUser(identifier: string, password: string) {
  const normalized = identifier.toLowerCase().trim()
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    }
  })

  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash)
  if (!passwordMatch) {
    throw new Error('INVALID_CREDENTIALS')
  }

  if (!user.emailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED')
  }

  // Create session
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)

  const sessionToken = jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: `${SESSION_DURATION_DAYS}d` }
  )

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt
    }
  })

  return {
    token: sessionToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarInitials: user.avatarInitials,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    }
  }
}

export async function logoutUser(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user) return

  await prisma.passwordReset.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true }
  })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token,
      expiresAt
    }
  })

  await sendPasswordResetEmail(user.email, user.name, token)
}

export async function resetPassword(token: string, newPassword: string) {
  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true }
  })

  if (!reset) throw new Error('INVALID_TOKEN')
  if (reset.used) throw new Error('TOKEN_USED')
  if (reset.expiresAt < new Date()) throw new Error('TOKEN_EXPIRED')

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash }
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { used: true }
    }),
    prisma.session.deleteMany({ where: { userId: reset.userId } })
  ])
}
