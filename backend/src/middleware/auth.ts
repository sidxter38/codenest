import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    username: string
    name: string
  }
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const token = authHeader.substring(7)
    const secret = process.env.JWT_SECRET
    if (!secret) {
      res.status(500).json({ error: 'Server configuration error' })
      return
    }

    let decoded: { userId: string; sessionId: string }
    try {
      decoded = jwt.verify(token, secret) as { userId: string; sessionId: string }
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    // Verify session still exists
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: 'Session expired' })
      return
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      name: session.user.name
    }

    next()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function requireProjectRole(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  allowedRoles: string[]
): Promise<void> {
  const projectId = req.params.projectId || req.params.id
  const userId = req.user?.id

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  })

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this project' })
    return
  }

  if (!allowedRoles.includes(membership.role)) {
    res.status(403).json({ error: 'Insufficient permissions' })
    return
  }

  next()
}
