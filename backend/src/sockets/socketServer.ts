import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import prisma from '../config/database'

interface WorkspaceUser {
  socketId: string
  userId: string
  name: string
  username: string
  color: string
  activeFile?: string
  cursor?: { line: number; ch: number }
}

const USER_COLORS = [
  '#7ADCF0', '#4ce0b3', '#ffd166', '#ff6b8b', '#c084fc',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c', '#a78bfa'
]

// Map workspace code -> Map of socketId -> WorkspaceUser
const workspaceRosters = new Map<string, Map<string, WorkspaceUser>>()

export function setupSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        const clean = origin.replace(/\/+$/, '')
        const isAllowed =
          allowedOrigins.some((o) => o.replace(/\/+$/, '') === clean) ||
          clean.includes('localhost') ||
          clean.includes('127.0.0.1') ||
          clean.endsWith('.vercel.app')
        callback(null, isAllowed)
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  })

  io.on('connection', (socket: Socket) => {
    let currentWorkspace: string | null = null
    let currentUser: WorkspaceUser | null = null

    // Join collaborative workspace room
    socket.on('join_workspace', async (data: {
      workspaceCode: string
      userId: string
      name: string
      username: string
    }) => {
      const code = data.workspaceCode.toUpperCase().trim()
      currentWorkspace = code
      socket.join(`ws:${code}`)

      if (!workspaceRosters.has(code)) {
        workspaceRosters.set(code, new Map())
      }

      const roster = workspaceRosters.get(code)!
      const colorIndex = roster.size % USER_COLORS.length
      const userColor = USER_COLORS[colorIndex]

      currentUser = {
        socketId: socket.id,
        userId: data.userId,
        name: data.name,
        username: data.username,
        color: userColor
      }

      roster.set(socket.id, currentUser)

      console.log(`[Socket.IO] ${data.name} joined workspace ${code} (${roster.size} active)`)

      // Broadcast roster to room
      io.to(`ws:${code}`).emit('presence_update', {
        users: Array.from(roster.values()),
        joinedUser: currentUser
      })
    })

    // Cursor position broadcasting (throttled on client)
    socket.on('cursor_move', (data: {
      workspaceCode: string
      line: number
      ch: number
      fileName: string
    }) => {
      if (!currentWorkspace || !currentUser) return
      currentUser.cursor = { line: data.line, ch: data.ch }
      currentUser.activeFile = data.fileName

      socket.to(`ws:${currentWorkspace}`).emit('remote_cursor', {
        userId: currentUser.userId,
        name: currentUser.name,
        color: currentUser.color,
        line: data.line,
        ch: data.ch,
        fileName: data.fileName
      })
    })

    // Real-time document changes
    socket.on('code_change', (data: {
      workspaceCode: string
      fileName: string
      content: string
      change?: any
    }) => {
      if (!currentWorkspace) return
      socket.to(`ws:${currentWorkspace}`).emit('remote_code_change', {
        fileName: data.fileName,
        content: data.content,
        userId: currentUser?.userId,
        change: data.change
      })
    })

    // Collaborative file system operations
    socket.on('file_operation', (data: {
      workspaceCode: string
      type: 'create' | 'delete' | 'rename'
      file: any
    }) => {
      if (!currentWorkspace) return
      socket.to(`ws:${currentWorkspace}`).emit('remote_file_operation', data)
    })

    // Disconnect handling
    socket.on('disconnect', () => {
      if (currentWorkspace && workspaceRosters.has(currentWorkspace)) {
        const roster = workspaceRosters.get(currentWorkspace)!
        roster.delete(socket.id)

        console.log(`[Socket.IO] Client disconnected from ${currentWorkspace} (${roster.size} remaining)`)

        io.to(`ws:${currentWorkspace}`).emit('presence_update', {
          users: Array.from(roster.values()),
          leftUserId: currentUser?.userId
        })

        if (roster.size === 0) {
          workspaceRosters.delete(currentWorkspace)
        }
      }
    })
  })

  console.log('[Socket.IO] Collaboration server initialized')
  return io
}
