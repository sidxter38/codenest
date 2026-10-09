import { Router, Response } from 'express'
import { body, validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import { authenticate, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'

const router = Router()

// GET /api/users/profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        avatarInitials: true,
        emailVerified: true,
        createdAt: true,
        projectMemberships: {
          include: { project: { select: { id: true, name: true, language: true } } }
        }
      }
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// PATCH /api/users/profile
router.patch(
  '/profile',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('username').optional().trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_-]+$/)
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const { name, username } = req.body

      if (username) {
        const existing = await prisma.user.findUnique({ where: { username } })
        if (existing && existing.id !== req.user!.id) {
          res.status(409).json({ error: 'Username already taken' })
          return
        }
      }

      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          ...(name && { name, avatarInitials: name.split(' ').slice(0, 2).map((n: string) => n[0]?.toUpperCase() || '').join('') }),
          ...(username && { username })
        },
        select: { id: true, name: true, username: true, email: true, avatarInitials: true }
      })

      res.json({ user: updated })
    } catch {
      res.status(500).json({ error: 'Update failed' })
    }
  }
)

// POST /api/users/change-password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be at least 8 chars with uppercase, lowercase, and number'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error('Passwords do not match')
      return true
    })
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
      if (!user) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      const passwordMatch = await bcrypt.compare(req.body.currentPassword, user.passwordHash)
      if (!passwordMatch) {
        res.status(400).json({ error: 'Current password is incorrect' })
        return
      }

      const passwordHash = await bcrypt.hash(req.body.newPassword, 12)
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

      res.json({ message: 'Password changed successfully' })
    } catch {
      res.status(500).json({ error: 'Failed to change password' })
    }
  }
)

export default router
