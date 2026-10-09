import dotenv from 'dotenv'
import path from 'path'
dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import http from 'http'
import { WebSocketServer } from 'ws'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import projectRoutes from './routes/projects'
import notificationRoutes from './routes/notifications'
import playgroundRoutes, { playgroundLimiter } from './routes/playground'
import workspaceRoutes from './routes/workspaces'
import { setupCollabServer } from './sockets/collab'
import { setupSocketServer } from './sockets/socketServer'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'

const app = express()
app.set('trust proxy', 1)
const server = http.createServer(app)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}))

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const cleanOrigin = origin.replace(/\/+$/, '')
    const isAllowed =
      allowedOrigins.some((o) => o.replace(/\/+$/, '') === cleanOrigin) ||
      cleanOrigin.includes('localhost') ||
      cleanOrigin.includes('127.0.0.1') ||
      cleanOrigin.endsWith('.vercel.app')

    if (isAllowed) {
      return callback(null, true)
    }
    return callback(null, false)
  },
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Logging
app.use(requestLogger)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api', limiter)

// Stricter limit for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts, please try again later.' }
})

// Routes
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/workspaces', workspaceRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/playground', playgroundLimiter, playgroundRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use(errorHandler)

// Initialize Socket.IO collaboration server
setupSocketServer(server)

// Legacy WebSocket collaboration server
const wss = new WebSocketServer({ server, path: '/collab' })
setupCollabServer(wss)

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`[CodeNest] Backend running on port ${PORT}`)
  console.log(`[CodeNest] WebSocket collab server ready on /collab`)
})

export default app
