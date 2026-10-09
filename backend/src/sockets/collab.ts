import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import * as Y from 'yjs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupWSConnection } = require('y-websocket/bin/utils')

interface CollabRoom {
  doc: Y.Doc
  clients: Set<WebSocket>
}

const rooms = new Map<string, CollabRoom>()

export function setupCollabServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // URL format: /collab?room=projectId-fileId or /collab/projectId-fileId
    const url = new URL(req.url || '', 'http://localhost')
    const pathParts = url.pathname.split('/').filter(Boolean)
    const room = url.searchParams.get('room') || (pathParts.length > 1 ? pathParts[pathParts.length - 1] : undefined)

    if (!room) {
      ws.close(1008, 'Room parameter required')
      return
    }

    if (!rooms.has(room)) {
      rooms.set(room, { doc: new Y.Doc(), clients: new Set() })
    }

    const roomData = rooms.get(room)!
    roomData.clients.add(ws)

    console.log(`[Collab] Client joined room: ${room} (${roomData.clients.size} users)`)

    // Use y-websocket's built-in connection handler
    setupWSConnection(ws, req, { docName: room })

    ws.on('close', () => {
      roomData.clients.delete(ws)
      console.log(`[Collab] Client left room: ${room} (${roomData.clients.size} users)`)

      if (roomData.clients.size === 0) {
        // Clean up empty rooms after a delay
        setTimeout(() => {
          if (rooms.get(room)?.clients.size === 0) {
            rooms.delete(room)
            console.log(`[Collab] Room cleaned up: ${room}`)
          }
        }, 30000)
      }
    })

    ws.on('error', (error) => {
      console.error(`[Collab] WebSocket error in room ${room}:`, error.message)
    })
  })

  console.log('[Collab] WebSocket server initialized')
}

export function getRoomSize(room: string): number {
  return rooms.get(room)?.clients.size || 0
}
