import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  Play, Save, Sparkles, Users, MessageSquareText, History,
  FileCode2, Plus, Trash2, Copy, Check, Terminal, Eye,
  Clock, ArrowRight, Share2, AlertCircle, ChevronDown, CheckCircle2, RotateCcw, X
} from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { useAuth } from '../contexts/AuthContext'
import {
  getWorkspaceByCode, saveWorkspaceDoc, createWorkspaceDoc,
  deleteWorkspaceDoc, getWorkspaceVersions, createWorkspaceVersionSnapshot,
  executeWorkspaceCode, runWorkspaceAIReview,
  WorkspaceData, WorkspaceDoc, WorkspaceVersion
} from '../services/workspaces'
import {
  getCollabSocket, joinWorkspaceRoom, sendCursorMove,
  sendCodeChange, sendFileOperation, CollabUser, RemoteCursorData
} from '../services/socket'
import { ExecutionResult } from '../services/projects'
import { executeJavaScriptInBrowser } from '../services/browserSandbox'
import api from '../services/api'
import { cleanTerminalOutput } from '../services/playground'
import './CollaborativeWorkspace.css'


export default function CollaborativeWorkspace() {
  const params = useParams<{ code?: string; id?: string }>()
  const rawCode = params.code || params.id || ''
  const workspaceCode = rawCode.toUpperCase().trim()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Workspace Data
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [documents, setDocuments] = useState<WorkspaceDoc[]>([])
  const [activeDocName, setActiveDocName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Real-time Collaboration State
  const [onlineUsers, setOnlineUsers] = useState<CollabUser[]>([])
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursorData>>(new Map())

  // Save State
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving…' | 'Unsaved changes'>('Saved')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cursorThrottleRef = useRef<number>(0)

  // Output & Execution
  const [running, setRunning] = useState(false)
  const [outputTab, setOutputTab] = useState<'preview' | 'terminal' | 'console'>('terminal')
  const [terminalOutput, setTerminalOutput] = useState('$ Program Output\nReady to run.')
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string }>>([])
  const [executionTime, setExecutionTime] = useState('—')

  // Output and Terminal Drawer Resizing (VS Code Style)
  const [drawerHeight, setDrawerHeight] = useState(240)
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false)
  const isDraggingDrawerRef = useRef(false)

  const handleStartResizeDrawer = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingDrawerRef.current = true
    setIsDraggingDrawer(true)
    const startY = e.clientY
    const startH = drawerHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingDrawerRef.current) return
      // Dragging UP increases height, dragging DOWN decreases height
      const deltaY = startY - ev.clientY
      const maxH = Math.max(window.innerHeight - 150, 400)
      const nextH = Math.min(Math.max(startH + deltaY, 120), maxH)
      setDrawerHeight(nextH)
    }

    const onMouseUp = () => {
      isDraggingDrawerRef.current = false
      setIsDraggingDrawer(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Review & AI Panel
  const [rightPanelTab, setRightPanelTab] = useState<'comments' | 'ai' | 'history'>('ai')
  const [aiRunning, setAiRunning] = useState(false)
  const [aiFindings, setAiFindings] = useState<any[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [aiError, setAiError] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [newCommentText, setNewCommentText] = useState('')
  const [versions, setVersions] = useState<WorkspaceVersion[]>([])
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [newVersionSummary, setNewVersionSummary] = useState('')

  // UI state
  const [copiedCode, setCopiedCode] = useState(false)
  const [showNewDocModal, setShowNewDocModal] = useState(false)
  const [newDocName, setNewDocName] = useState('')

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<string[]>([])

  const activeDoc = useMemo(() => {
    return documents.find(d => d.name === activeDocName) || documents[0]
  }, [documents, activeDocName])

  // Load workspace data
  useEffect(() => {
    if (!workspaceCode) return
    loadWorkspace()
  }, [workspaceCode])

  async function loadWorkspace() {
    setLoading(true)
    setError('')
    try {
      const data = await getWorkspaceByCode(workspaceCode)
      setWorkspace(data)
      setDocuments(data.documents || [])
      if (data.documents && data.documents.length > 0) {
        setActiveDocName(data.documents[0].name)
      }
      if (data.language === 'html') {
        setOutputTab('preview')
      } else if (data.language === 'javascript') {
        setOutputTab('console')
      } else {
        setOutputTab('terminal')
      }
    } catch {
      setError('Workspace not found or expired.')
    } finally {
      setLoading(false)
    }
  }

  // Socket.IO Room Joining & Event Listeners
  useEffect(() => {
    if (!workspaceCode || !user) return

    // Connect and join room
    joinWorkspaceRoom({
      workspaceCode,
      userId: user.id,
      name: user.name,
      username: user.username
    })

    const socket = getCollabSocket()

    // Listen for presence roster updates
    const handlePresence = (data: { users: CollabUser[] }) => {
      setOnlineUsers(data.users || [])
    }

    // Listen for remote cursors
    const handleRemoteCursor = (data: RemoteCursorData) => {
      setRemoteCursors(prev => {
        const next = new Map(prev)
        next.set(data.userId, data)
        return next
      })
    }

    // Listen for remote code changes
    const handleRemoteCodeChange = (data: { fileName: string; content: string; userId?: string }) => {
      if (data.userId === user.id) return // Ignore own broadcast

      const editor = editorRef.current
      if (editor && activeDoc?.name === data.fileName) {
        if (editor.getValue() !== data.content) {
          const pos = editor.getPosition()
          const sel = editor.getSelection()
          editor.setValue(data.content)
          if (pos) editor.setPosition(pos)
          if (sel) editor.setSelection(sel)
        }
      }

      setDocuments(prev => prev.map(doc => {
        if (doc.name === data.fileName) {
          return { ...doc, content: data.content }
        }
        return doc
      }))
    }

    // Listen for file operations
    const handleRemoteFileOp = (data: { type: string; file: any }) => {
      if (data.type === 'create') {
        setDocuments(prev => [...prev.filter(d => d.id !== data.file.id), data.file])
      } else if (data.type === 'delete') {
        setDocuments(prev => prev.filter(d => d.name !== data.file.name))
      }
    }

    socket.on('presence_update', handlePresence)
    socket.on('remote_cursor', handleRemoteCursor)
    socket.on('remote_code_change', handleRemoteCodeChange)
    socket.on('remote_file_operation', handleRemoteFileOp)

    return () => {
      socket.off('presence_update', handlePresence)
      socket.off('remote_cursor', handleRemoteCursor)
      socket.off('remote_code_change', handleRemoteCodeChange)
      socket.off('remote_file_operation', handleRemoteFileOp)
    }
  }, [workspaceCode, user])

  // Update Monaco remote cursor decorations
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeDoc) return

    const newDecorations: monaco.editor.IModelDeltaDecoration[] = []

    remoteCursors.forEach((c) => {
      if (c.userId === user?.id || c.fileName !== activeDoc.name) return

      newDecorations.push({
        range: new monaco.Range(c.line, c.ch, c.line, c.ch + 1),
        options: {
          className: 'remote-cursor-widget',
          beforeContentClassName: 'remote-cursor-caret',
          hoverMessage: { value: `**${c.name}** is here` }
        }
      })
    })

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations)
  }, [remoteCursors, activeDoc, user])

  // Editor Content Change with Debounced 1-Second Autosave (Req 25)
  function handleEditorChange(newVal: string | undefined) {
    const content = newVal ?? ''
    if (!activeDoc) return

    // Update local state
    setDocuments(prev => prev.map(d => d.name === activeDoc.name ? { ...d, content } : d))
    setSaveStatus('Unsaved changes')

    // Broadcast code change to collaborators
    sendCodeChange({
      workspaceCode,
      fileName: activeDoc.name,
      content
    })

    // Debounced 1-Second Autosave
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving…')
      try {
        await saveWorkspaceDoc(workspaceCode, activeDoc.id, content)
        setSaveStatus('Saved')
      } catch {
        setSaveStatus('Unsaved changes')
      }
    }, 1000)
  }

  // Cursor Move Listener (Throttled 30ms - Req 23)
  function handleEditorMount(editor: monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor

    editor.onDidChangeCursorPosition((e) => {
      const now = Date.now()
      if (now - cursorThrottleRef.current > 30 && activeDoc) {
        cursorThrottleRef.current = now
        sendCursorMove({
          workspaceCode,
          line: e.position.lineNumber,
          ch: e.position.column,
          fileName: activeDoc.name
        })
      }
    })
  }

  // Run Code
  async function handleRun() {
    if (!activeDoc) return
    setRunning(true)
    const t0 = performance.now()

    if (workspace?.language === 'html') {
      setOutputTab('preview')
      setExecutionTime('0.005s')
      setRunning(false)
      return
    }

    if (workspace?.language === 'javascript') {
      setOutputTab('console')
      const jsDoc = documents.find(d => d.name.endsWith('.js')) || activeDoc
      try {
        const res = await executeJavaScriptInBrowser(jsDoc.content)
        setConsoleLogs(res.logs)
        setExecutionTime(res.time)
      } catch (err: unknown) {
        setConsoleLogs([{ type: 'error', message: String(err) }])
      } finally {
        setRunning(false)
      }
      return
    }

    // Server execution: Python
    setOutputTab('terminal')
    setTerminalOutput('$ Program Output\nExecuting in isolated sandbox…\n')

    try {
      const res = await executeWorkspaceCode(workspaceCode, {
        docId: activeDoc.id
      })

      const elapsed = ((performance.now() - t0) / 1000).toFixed(3) + 's'
      setExecutionTime(elapsed)

      let out = '$ Program Output\n\n'
      const cleanStdout = cleanTerminalOutput(res.stdout)
      const cleanStderr = cleanTerminalOutput(res.stderr)
      if (cleanStdout) out += cleanStdout
      if (cleanStderr) out += (cleanStdout ? '\n\n' : '') + `[Errors / Stderr]\n${cleanStderr}`
      if (!cleanStdout && !cleanStderr) out += 'Process finished with exit code ' + (res.exitCode ?? 0)
      else if (res.exitCode === 0) {
        if (!out.includes('Process finished')) {
          out += '\n\nProcess finished successfully.'
        }
      } else {
        out += `\n\nProcess finished with exit code ${res.exitCode}.`
      }

      setTerminalOutput(out)
    } catch {
      setTerminalOutput('$ Program Output\n\nExecution failed. Sandbox unavailable.')
    } finally {
      setRunning(false)
    }
  }

  // Run Structured AI Review with Gemini (Req 13)
  async function handleRunAIReview() {
    if (!activeDoc) return
    setAiRunning(true)
    setRightPanelTab('ai')
    setAiError('')

    try {
      const res = await runWorkspaceAIReview(workspaceCode, {
        docId: activeDoc.id,
        categories: ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations', 'Explanation']
      })
      setAiFindings(res.issues || [])
      setAiSummary(res.summary || 'Review complete.')
    } catch {
      // Fallback: direct review
      try {
        const fallbackRes = await api.post('/projects/ai-direct-review', {
          code: activeDoc.content,
          language: activeDoc.language || workspace?.language || 'javascript',
          fileName: activeDoc.name,
          categories: ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations']
        })
        setAiFindings(fallbackRes.data.issues || fallbackRes.data.findings || [])
        setAiSummary(fallbackRes.data.summary || 'Review complete.')
      } catch {
        setAiError('AI Review service temporarily unavailable. Please verify GEMINI_API_KEY.')
      }
    } finally {
      setAiRunning(false)
    }
  }


  // Version History Snapshot (Req 26)
  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault()
    setCreatingVersion(true)
    try {
      const res = await createWorkspaceVersionSnapshot(workspaceCode, newVersionSummary || undefined)
      setVersions(prev => [res.version, ...prev])
      setNewVersionSummary('')
    } catch {
      alert('Failed to create version snapshot.')
    } finally {
      setCreatingVersion(false)
    }
  }

  // Load versions when tab opened
  useEffect(() => {
    if (rightPanelTab === 'history') {
      getWorkspaceVersions(workspaceCode).then(setVersions).catch(() => {})
    }
  }, [rightPanelTab, workspaceCode])

  // Copy 4-digit workspace code
  function handleCopyCode() {
    navigator.clipboard.writeText(workspace?.code || workspaceCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  // Add new document
  async function handleCreateDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!newDocName.trim()) return

    const name = newDocName.trim()
    let lang = 'javascript'
    if (name.endsWith('.py')) lang = 'python'
    else if (name.endsWith('.html')) lang = 'html'
    else if (name.endsWith('.css')) lang = 'css'

    try {
      const res = await createWorkspaceDoc(workspaceCode, { name, language: lang })
      setDocuments(prev => [...prev, res.document])
      setActiveDocName(res.document.name)
      setShowNewDocModal(false)
      setNewDocName('')

      // Broadcast file operation
      sendFileOperation({
        workspaceCode,
        type: 'create',
        file: res.document
      })
    } catch {
      alert('Failed to create file.')
    }
  }

  if (loading) {
    return (
      <div className="workspace-loading-screen">
        <div className="spinner" />
        <p>Connecting to Collaborative Workspace {workspaceCode}…</p>
      </div>
    )
  }

  if (error || !workspace) {
    return (
      <div className="workspace-error-screen">
        <AlertCircle size={48} color="#ff6b8b" />
        <h2>{error || 'Workspace not found.'}</h2>
        <p>The workspace code may be invalid, closed, or expired.</p>
        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: '16px' }}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  // Live HTML/CSS preview
  const livePreviewDoc = `
<!DOCTYPE html>
<html>
<head>
  <style>${documents.find(d => d.name.endsWith('.css'))?.content || ''}</style>
</head>
<body>
  ${(documents.find(d => d.name.endsWith('.html'))?.content || '')
    .replace(/<link[^>]*href=["'][^"']*style\.css["'][^>]*>/gi, '')
    .replace(/<script[^>]*src=["'][^"']*script\.js["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<!DOCTYPE html>[\s\S]*?<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*?<\/html>/i, '')}
  <script>${documents.find(d => d.name.endsWith('.js'))?.content || ''}</script>
</body>
</html>
`

  return (
    <div className="collab-workspace-page">
      {/* ── Top Header Navigation Bar ──────────────────────────── */}
      <header className="ws-header">
        <div className="ws-header-left">
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Logo size="xs" />
          </Link>
          <span className="ws-divider">/</span>
          <span className="ws-title truncate">{workspace.name}</span>

          {/* 4-Digit Code Share Pill (Req 19) */}
          <div className="ws-code-pill" onClick={handleCopyCode} title="Click to copy code">
            <span className="code-text">{workspace.code}</span>
            <button className="code-copy-btn">
              {copiedCode ? <Check size={13} color="#4ce0b3" /> : <Copy size={13} />}
            </button>
            {copiedCode && <span className="copied-tooltip">Copied!</span>}
          </div>

          {/* Autosave Status Indicator (Req 25) */}
          <div className="ws-save-indicator">
            {saveStatus === 'Saved' && <span className="status-saved"><CheckCircle2 size={12} /> Saved</span>}
            {saveStatus === 'Saving…' && <span className="status-saving"><Clock size={12} /> Saving…</span>}
            {saveStatus === 'Unsaved changes' && <span className="status-unsaved">● Unsaved</span>}
          </div>
        </div>

        {/* Real-time Presence Roster (Req 21) */}
        <div className="ws-header-center">
          <div className="ws-presence-roster">
            <span className="presence-dot">●</span>
            <span className="presence-count">{onlineUsers.length} Online</span>
            <div className="avatar-stack">
              {onlineUsers.map(u => (
                <div
                  key={u.socketId}
                  className="avatar avatar-sm"
                  style={{ background: u.color, color: '#1C2A52' }}
                  title={`${u.name} (@${u.username})`}
                >
                  {u.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ws-header-right">
          <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running}>
            <Play size={13} fill="currentColor" /> Run Code
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleRunAIReview} disabled={aiRunning}>
            <Sparkles size={14} color="#FFFFFF" /> Review AI
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleCopyCode}>
            <Share2 size={14} /> Share
          </button>
        </div>
      </header>

      {/* ── IDE Main Split Body ─────────────────────────────────── */}
      <div className="ws-body-layout">
        {/* Left Explorer: Collaborative File System (Req 24) */}
        <aside className="ws-sidebar">
          <div className="ws-sidebar-header">
            <span>FILES</span>
            <button className="btn-icon btn-ghost" onClick={() => setShowNewDocModal(true)} title="New file">
              <Plus size={14} />
            </button>
          </div>

          <div className="ws-file-list">
            {documents.map(doc => (
              <div
                key={doc.id || doc.name}
                className={`ws-file-item ${doc.name === activeDoc?.name ? 'active' : ''}`}
                onClick={() => setActiveDocName(doc.name)}
              >
                <FileCode2 size={14} className="file-icon" />
                <span className="file-name truncate">{doc.name}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: Monaco Editor with Remote Cursors (Req 22, 23) */}
        <main className="ws-editor-container">
          <div className="ws-editor-tabs">
            <div className="ws-tab active">
              <span>{activeDoc?.name}</span>
            </div>
          </div>

          <div className="ws-monaco-mount">
            {activeDoc && (
              <Editor
                key={activeDoc.name}
                path={activeDoc.name}
                height="100%"
                theme="vs-dark"
                language={activeDoc.language || 'javascript'}
                defaultValue={activeDoc.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13.5,
                  lineHeight: 22,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: 'all',
                  cursorBlinking: 'smooth'
                }}
              />
            )}
          </div>

          {/* Bottom Execution Output Panel (Req 10, 30) */}
          <div className={`ws-output-drawer ${isDraggingDrawer ? 'dragging' : ''}`} style={{ height: `${drawerHeight}px` }}>
            <div
              className={`ws-drawer-resizer-row ${isDraggingDrawer ? 'active' : ''}`}
              onMouseDown={handleStartResizeDrawer}
              onDoubleClick={() => setDrawerHeight(240)}
              title="Drag to expand output & terminal (Double-click to reset)"
            />
            <div className="output-drawer-header">
              <div className="drawer-tabs">
                {workspace.language === 'html' && (
                  <button className={`tab-btn ${outputTab === 'preview' ? 'active' : ''}`} onClick={() => setOutputTab('preview')}>
                    <Eye size={13} /> Preview
                  </button>
                )}
                {workspace.language === 'javascript' && (
                  <button className={`tab-btn ${outputTab === 'console' ? 'active' : ''}`} onClick={() => setOutputTab('console')}>
                    <Terminal size={13} /> Console
                  </button>
                )}
                {workspace.language === 'python' && (
                  <button className={`tab-btn ${outputTab === 'terminal' ? 'active' : ''}`} onClick={() => setOutputTab('terminal')}>
                    <Terminal size={13} /> Terminal Output
                  </button>
                )}
              </div>
              <div className="drawer-actions">
                <span className="exec-time"><Clock size={12} /> {executionTime}</span>
              </div>
            </div>

            <div className="drawer-body">
              {outputTab === 'preview' && (
                <iframe title="Live Output" className="preview-frame" srcDoc={livePreviewDoc} sandbox="allow-scripts" style={{ pointerEvents: isDraggingDrawer ? 'none' : 'auto' }} />
              )}
              {outputTab === 'console' && (
                <div className="console-stream">
                  {consoleLogs.length === 0 ? <p className="empty-text">Console ready.</p> : consoleLogs.map((l, i) => (
                    <div key={i} className={`console-line log-${l.type}`}>&gt; {l.message}</div>
                  ))}
                </div>
              )}
              {outputTab === 'terminal' && (
                <pre className="terminal-stream">{terminalOutput}</pre>
              )}
            </div>
          </div>
        </main>

        {/* Right: Review & History Drawer (Req 13, 26, 28) */}
        <aside className="ws-review-panel">
          <div className="review-panel-tabs">
            <button
              className={`panel-tab-btn ${rightPanelTab === 'ai' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('ai')}
            >
              <Sparkles size={13} /> AI Review
            </button>
            <button
              className={`panel-tab-btn ${rightPanelTab === 'comments' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('comments')}
            >
              <MessageSquareText size={13} /> Comments
            </button>
            <button
              className={`panel-tab-btn ${rightPanelTab === 'history' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('history')}
            >
              <History size={13} /> History
            </button>
          </div>

          <div className="review-panel-content">
            {/* AI Review Tab */}
            {rightPanelTab === 'ai' && (
              <div className="ai-review-view">
                <div className="ai-actions-bar">
                  <button
                    className={`btn btn-primary btn-sm btn-full ${aiRunning ? 'btn-loading' : ''}`}
                    onClick={handleRunAIReview}
                    disabled={aiRunning}
                  >
                    <Sparkles size={13} /> Run AI Code Review
                  </button>
                </div>

                {aiError && <div className="panel-error">{aiError}</div>}
                {aiSummary && <div className="ai-summary-box"><p>{aiSummary}</p></div>}

                <div className="ai-findings-list">
                  {aiFindings.map((f, i) => (
                    <div key={i} className={`ai-issue-card severity-${f.severity?.toLowerCase() || 'medium'}`}>
                      <div className="issue-header">
                        <span className={`badge badge-${f.severity?.toLowerCase() === 'critical' ? 'red' : 'yellow'}`}>
                          {f.severity || 'Issue'}
                        </span>
                        {f.line && <span className="line-num">Line {f.line}</span>}
                      </div>
                      <h4>{f.title}</h4>
                      <p>{f.description}</p>
                      {f.suggestion && (
                        <div className="suggestion-box">
                          <strong>Recommendation:</strong>
                          <p>{f.suggestion}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments Tab */}
            {rightPanelTab === 'comments' && (
              <div className="comments-view">
                <div className="comment-composer">
                  <textarea
                    className="form-textarea"
                    placeholder="Add a review comment..."
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }}>
                    Post Comment
                  </button>
                </div>
                <div className="empty-panel-state">
                  <MessageSquareText size={24} color="var(--text-subtle)" />
                  <p>No comments on this file yet.</p>
                </div>
              </div>
            )}

            {/* Version History Tab (Req 26) */}
            {rightPanelTab === 'history' && (
              <div className="history-view">
                <form onSubmit={handleCreateSnapshot} className="version-composer">
                  <input
                    className="form-input"
                    placeholder="Snapshot note (e.g. Version 2)"
                    value={newVersionSummary}
                    onChange={e => setNewVersionSummary(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary btn-sm" disabled={creatingVersion}>
                    Create Version Snapshot
                  </button>
                </form>

                <div className="versions-list">
                  {versions.length === 0 ? (
                    <p className="empty-text">No version snapshots saved yet.</p>
                  ) : (
                    versions.map(v => (
                      <div key={v.id} className="version-card">
                        <div className="version-header">
                          <span className="version-title">Version {v.versionNum}</span>
                          <span className="version-time">{new Date(v.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="version-desc">{v.summary}</p>
                        <button
                          className="btn btn-ghost btn-sm restore-btn"
                          onClick={() => {
                            try {
                              const files = JSON.parse(v.snapshot)
                              files.forEach((f: any) => {
                                const target = documents.find(d => d.name === f.name)
                                if (target) saveWorkspaceDoc(workspaceCode, target.id, f.content)
                              })
                              loadWorkspace()
                            } catch {}
                          }}
                        >
                          <RotateCcw size={12} /> Restore This Version
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* New Document Modal */}
      {showNewDocModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowNewDocModal(false)}>
          <div className="modal" style={{ maxWidth: '380px' }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New File</h2>
              <button className="btn-icon btn-ghost" onClick={() => setShowNewDocModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateDoc} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">File Name</label>
                <input
                  className="form-input"
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  placeholder="e.g. utils.js or helper.py"
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewDocModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
