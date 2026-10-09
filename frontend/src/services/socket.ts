import { io, Socket } from 'socket.io-client'

export interface CollabUser {
  socketId: string
  userId: string
  name: string
  username: string
  color: string
  activeFile?: string
  cursor?: { line: number; ch: number }
}

export interface RemoteCursorData {
  userId: string
  name: string
  color: string
  line: number
  ch: number
  fileName: string
}

let socket: Socket | null = null

export function getCollabSocket(): Socket {
  if (!socket) {
    const envUrl = typeof process !== 'undefined' && process.env ? process.env.REACT_APP_SOCKET_URL : undefined
    const serverUrl =
      envUrl ||
      (typeof window !== 'undefined' && (window.location.port === '3000' || window.location.hostname === 'localhost')
        ? 'http://localhost:5000'
        : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:5000')

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    })

    socket.on('connect', () => {
      console.log('[CollabSocket] Connected to realtime server with id:', socket?.id)
    })

    socket.on('disconnect', (reason) => {
      console.log('[CollabSocket] Disconnected:', reason)
    })
  }

  return socket
}

export function joinWorkspaceRoom(data: {
  workspaceCode: string
  userId: string
  name: string
  username: string
}) {
  const s = getCollabSocket()
  s.emit('join_workspace', data)
}

export function sendCursorMove(data: {
  workspaceCode: string
  line: number
  ch: number
  fileName: string
}) {
  const s = getCollabSocket()
  s.emit('cursor_move', data)
}

export function sendCodeChange(data: {
  workspaceCode: string
  fileName: string
  content: string
  change?: any
}) {
  const s = getCollabSocket()
  s.emit('code_change', data)
}

export function sendFileOperation(data: {
  workspaceCode: string
  type: 'create' | 'delete' | 'rename'
  file: any
}) {
  const s = getCollabSocket()
  s.emit('file_operation', data)
}

export function disconnectCollabSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
