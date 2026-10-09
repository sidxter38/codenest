import React, { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, ArrowRight, X, Copy, Check, LogIn } from 'lucide-react'
import { createCollaborativeWorkspace, joinCollaborativeWorkspace, WorkspaceData } from '../services/workspaces'
import { Project } from '../services/projects'

interface CollabModalProps {
  project?: Project | null
  onClose: () => void
  onCreated?: (ws: WorkspaceData) => void
  initialTab?: 'create' | 'join'
}

export function CollabModal({ project, onClose, onCreated, initialTab = 'create' }: CollabModalProps) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'create' | 'join'>(initialTab)

  React.useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  // Create Room State
  const [roomName, setRoomName] = useState(project ? `${project.name} Collab` : 'Collaborative Session')
  const [language, setLanguage] = useState(
    project?.language?.toLowerCase()?.includes('python') ? 'python' :
    project?.language?.toLowerCase()?.includes('html') ? 'html' : 'javascript'
  )
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdInfo, setCreatedInfo] = useState<{
    code: string
    numericCode: string
    workspace: WorkspaceData
  } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Join Room State
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault()
    setCreateLoading(true)
    setCreateError('')
    try {
      const res = await createCollaborativeWorkspace({
        name: roomName.trim(),
        language,
        projectId: project?.id
      })
      setCreatedInfo(res)
      onCreated?.(res.workspace)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setCreateError(e.response?.data?.error || 'Failed to create room')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleJoinRoom(e: FormEvent) {
    e.preventDefault()
    const trimmed = joinCode.trim()
    if (!trimmed) return
    setJoinLoading(true)
    setJoinError('')
    try {
      const res = await joinCollaborativeWorkspace(trimmed)
      onClose()
      navigate(`/workspace/${res.code}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setJoinError(e.response?.data?.error || 'Invalid or expired 4-digit code or Workspace ID')
    } finally {
      setJoinLoading(false)
    }
  }

  function handleCopyNumeric() {
    if (!createdInfo) return
    navigator.clipboard.writeText(createdInfo.numericCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  function handleCopyId() {
    if (!createdInfo) return
    navigator.clipboard.writeText(createdInfo.code)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
              <Users size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Collaborative Room
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {project ? `Project: ${project.name}` : 'Code together with real-time sync'}
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher: Create Room vs Join Room */}
        {!createdInfo && (
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '4px', margin: '4px 0 16px', gap: '4px' }}>
            <button
              type="button"
              className={`btn btn-sm ${tab === 'create' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, borderRadius: '6px', fontSize: '13px' }}
              onClick={() => { setTab('create'); setCreateError(''); }}
            >
              <Plus size={14} /> Create Room
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tab === 'join' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, borderRadius: '6px', fontSize: '13px' }}
              onClick={() => { setTab('join'); setJoinError(''); }}
            >
              <LogIn size={14} /> Join Room
            </button>
          </div>
        )}

        {/* CREATE ROOM VIEW */}
        {tab === 'create' && (
          !createdInfo ? (
            <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {createError && <div className="auth-error">{createError}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="collab-room-name">Room Name</label>
                <input
                  id="collab-room-name"
                  className="form-input"
                  placeholder="e.g. Code Review Room"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="collab-room-lang">Language</label>
                <select
                  id="collab-room-lang"
                  className="form-select"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                >
                  <option value="javascript">JavaScript (Node.js)</option>
                  <option value="python">Python</option>
                  <option value="html">HTML / CSS / JS</option>
                </select>
              </div>

              <div className="modal-footer" style={{ marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className={`btn btn-primary ${createLoading ? 'btn-loading' : ''}`} disabled={createLoading || !roomName.trim()}>
                  {!createLoading && <>Generate Room & Code <ArrowRight size={15} /></>}
                </button>
              </div>
            </form>
          ) : (
            /* ROOM GENERATED SUCCESS VIEW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                textAlign: 'center',
                padding: '20px 16px',
                background: 'linear-gradient(180deg, rgba(24, 24, 28, 0.85) 0%, rgba(14, 14, 18, 0.95) 100%)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
              }}>
                <span style={{ fontSize: '11px', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
                  Share With Collaborators
                </span>

                {/* 4-Digit Code */}
                <div style={{ margin: '10px 0 4px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>4-Digit Code:</span>
                  <div style={{
                    fontSize: '44px',
                    fontWeight: 900,
                    color: '#FFFFFF',
                    letterSpacing: '8px',
                    fontFamily: "'JetBrains Mono', monospace",
                    textShadow: '0 0 24px rgba(255, 255, 255, 0.25)'
                  }}>
                    {createdInfo.numericCode}
                  </div>
                </div>

                {/* Workspace ID */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontFamily: 'monospace'
                }}>
                  <span>Workspace ID: <b>{createdInfo.code}</b></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleCopyNumeric}>
                  {copiedCode ? <Check size={14} color="#22C55E" /> : <Copy size={14} />}
                  {copiedCode ? 'Code Copied!' : 'Copy 4-Digit Code'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleCopyId}>
                  {copiedId ? <Check size={14} color="#22C55E" /> : <Copy size={14} />}
                  {copiedId ? 'ID Copied!' : 'Copy Workspace ID'}
                </button>
              </div>

              <div className="modal-footer" style={{ marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose()
                    navigate(`/workspace/${createdInfo.code}`)
                  }}
                >
                  Enter Room <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )
        )}

        {/* JOIN ROOM VIEW */}
        {tab === 'join' && (
          <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {joinError && <div className="auth-error">{joinError}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="collab-join-input">
                Workspace ID or 4-Digit Code
              </label>
              <input
                id="collab-join-input"
                className="form-input"
                placeholder="e.g. 4827 or WS-4827"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                autoFocus
                required
                style={{
                  fontSize: '20px',
                  letterSpacing: '3px',
                  textAlign: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700
                }}
              />
              <span className="form-hint" style={{ textAlign: 'center', display: 'block', marginTop: '6px' }}>
                Enter the 4-digit code (e.g. <b>4827</b>) or Workspace ID given by your teammate.
              </span>
            </div>

            <div className="modal-footer" style={{ marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn-primary ${joinLoading ? 'btn-loading' : ''}`} disabled={joinLoading || !joinCode.trim()}>
                {!joinLoading && <>Join Room <ArrowRight size={15} /></>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
export default CollabModal
