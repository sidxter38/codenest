import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'

const router = Router()

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    res.json({ notifications })
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id, userId: req.user!.id },
      data: { read: true }
    })
    res.json({ message: 'Marked as read' })
  } catch {
    res.status(500).json({ error: 'Failed to update notification' })
  }
})

// PATCH /api/notifications/read-all
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true }
    })
    res.json({ message: 'All marked as read' })
  } catch {
    res.status(500).json({ error: 'Failed to update notifications' })
  }
})

// GET /api/notifications/activity
router.get('/activity', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activities = await prisma.activity.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        project: { select: { name: true } },
        user: { select: { name: true, avatarInitials: true } }
      }
    })

    res.json({ activities })
  } catch {
    res.status(500).json({ error: 'Failed to fetch activity' })
  }
})

export default router
