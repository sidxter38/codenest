import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  FileCode2, Folder, ChevronDown, ChevronRight, Plus, X, Play, Save,
  MessageSquareText, Sparkles, GitBranch, GitCommitHorizontal, Bell,
  CircleDot, Terminal, Settings, Search, Trash2, Check, RefreshCw,
  ArrowRight, Users, Shield, Zap, BookOpen, Code2, AlertTriangle,
  Info, AlertCircle, ChevronUp, MoreVertical, Copy, Share2, CheckCheck, Eye
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  getProject, getFiles, createFile, updateFile, deleteFile,
  executeCode, analyzeCode, runAIReview, getReviews, createReview,
  getReview, updateReview, getComments, addComment, resolveComment,
  createCommit, getCommits, Project, ProjectFile, Review,
  ReviewComment, AIFinding, Commit, ExecutionResult,
  diagnoseProjectError, AIDiagnosis
} from '../services/projects'
import {
  getCollabSocket, joinWorkspaceRoom, sendCursorMove,
  sendCodeChange, CollabUser, RemoteCursorData
} from '../services/socket'
import { Logo } from '../components/ui/Logo'
import { CollabModal } from '../components/CollabModal'
import { cleanTerminalOutput } from '../services/playground'
import './ProjectWorkspace.css'

type PanelTab = 'output' | 'terminal' | 'problems' | 'comments'
type RightPanelTab = 'review' | 'ai' | 'members' | 'commits'

function fileLanguage(file: ProjectFile): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript',
    jsx: 'javascript', tsx: 'typescript',
    py: 'python',
    html: 'html', htm: 'html', css: 'css',
    json: 'json', md: 'markdown', txt: 'plaintext'
  }
  return map[ext] || 'plaintext'
}

function langId(language: string): string {
  const map: Record<string, string> = {
    'HTML/CSS/JS': 'html', 'JavaScript': 'javascript', 'Python': 'python'
  }
  return map[language] || 'javascript'
}

function timeAgo(date: string) {
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return d.toLocaleDateString()
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'approved': return 'badge-green'
    case 'requested': case 'in_review': return 'badge-purple'
    case 'changes_requested': return 'badge-yellow'
    default: return 'badge-muted'
  }
}

function statusLabel(status: string) {
  const m: Record<string, string> = {
    draft: 'Draft', requested: 'Requested', in_review: 'In Review',
    changes_requested: 'Changes Requested', approved: 'Approved', resolved: 'Resolved'
  }
  return m[status] || status
}

interface NewFileModalProps {
  onClose: () => void
  onCreate: (name: string, isFolder: boolean, parentPath?: string) => void
  defaultParent?: string
}

function NewFileModal({ onClose, onCreate, defaultParent }: NewFileModalProps) {
  const [name, setName] = useState('')
  const [isFolder, setIsFolder] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), isFolder, defaultParent)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: '360px' }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h2>{isFolder ? 'New Folder' : 'New File'}</h2></div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isFolder ? 'src' : 'main.cpp'}
              autoFocus
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className={`btn ${!isFolder ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setIsFolder(false)}>
              <FileCode2 size={14} /> File
            </button>
            <button type="button" className={`btn ${isFolder ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setIsFolder(true)}>
              <Folder size={14} /> Folder
            </button>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SafeDiffViewerProps {
  original: string
  modified: string
  language: string
  active?: boolean
}

function SafeDiffViewer({ original, modified, language, active = false }: SafeDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const modelsRef = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null)

  // 1. Initialize standalone Monaco diff editor once
  useEffect(() => {
    if (!containerRef.current) return

    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false }
    })
    diffEditorRef.current = diffEditor

    return () => {
      // Step A: Explicitly unbind model before disposing models.
      // This detaches Monaco's internal onWillDispose listener in DiffEditorWidget,
      // completely eliminating "TextModel got disposed before DiffEditorWidget model got reset".
      try {
        diffEditor.setModel(null as any)
      } catch {
        // ignore
      }

      // Step B: Dispose models safely now that DiffEditorWidget is disconnected
      if (modelsRef.current) {
        try {
          modelsRef.current.original.dispose()
        } catch {}
        try {
          modelsRef.current.modified.dispose()
        } catch {}
        modelsRef.current = null
      }

      // Step C: Dispose diff editor widget
      try {
        diffEditor.dispose()
      } catch {}
      diffEditorRef.current = null
    }
  }, [])

  // 2. Synchronize models when original, modified, or language updates
  useEffect(() => {
    const diffEditor = diffEditorRef.current
    if (!diffEditor) return

    const prevModels = modelsRef.current

    // Create fresh models for diff comparison
    const originalModel = monaco.editor.createModel(original, language)
    const modifiedModel = monaco.editor.createModel(modified, language)

    // Set model on diff editor BEFORE disposing old models
    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel
    })

    modelsRef.current = { original: originalModel, modified: modifiedModel }

    // Safely dispose previous models
    if (prevModels) {
      try {
        prevModels.original.dispose()
      } catch {}
      try {
        prevModels.modified.dispose()
      } catch {}
    }
  }, [original, modified, language])

  // 3. Trigger layout recalculation when diff view becomes active
  useEffect(() => {
    if (active && diffEditorRef.current) {
      const timer = setTimeout(() => {
        try {
          diffEditorRef.current?.layout()
        } catch {}
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [active])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

export default function ProjectWorkspace() {
  const { id: projectId, reviewId: urlReviewId } = useParams<{ id: string; reviewId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Project state
  const [project, setProject] = useState<Project | null>(null)
  const [myRole, setMyRole] = useState<string>('')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Editor state
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>([])
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monacoEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const editorContentRef = useRef('')
  const cursorPosThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const staticDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-Save state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('codenest_autosave') !== 'false'
  })
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving…' | 'Unsaved changes'>('Saved')

  // Real-Time Collaboration state
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabCopied, setCollabCopied] = useState(false)
  const [desiredUsername, setDesiredUsername] = useState<string>(() => {
    return localStorage.getItem('codenest_collab_username') || user?.name || user?.username || 'DevUser'
  })
  const [editingUsername, setEditingUsername] = useState<string>('')
  const [collabUsers, setCollabUsers] = useState<CollabUser[]>([])
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursorData>>(new Map())
  const cursorThrottleRef = useRef<number>(0)
  const contentWidgetsRef = useRef<Map<string, monaco.editor.IContentWidget>>(new Map())

  // Cursor position tracking for status bar
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })

  // Error Diagnosis State (On-demand AI, minimal tokens)
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosis | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)

  // UI state
  const [explorerWidth] = useState(220)
  const [panelTab, setPanelTab] = useState<PanelTab>('output')
  const [rightTab, setRightTab] = useState<RightPanelTab>('review')
  const [showNewFile, setShowNewFile] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Execution
  const [output, setOutput] = useState<string>('Ready.')
  const [running, setRunning] = useState(false)
  const [executionStatus, setExecutionStatus] = useState('')
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [stdinInput, setStdinInput] = useState<string>('')
  const [interactiveInput, setInteractiveInput] = useState<string>('')
  const [showStdin, setShowStdin] = useState<boolean>(false)

  // Analysis
  const [problems, setProblems] = useState<Array<{ line: number; severity: string; message: string }>>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  // Reviews
  const [reviews, setReviews] = useState<Review[]>([])
  const [activeReview, setActiveReview] = useState<Review | null>(null)
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showCreateReview, setShowCreateReview] = useState(false)
  const [newReviewTitle, setNewReviewTitle] = useState('')
  const [creatingReview, setCreatingReview] = useState(false)

  // AI
  const [aiFindings, setAiFindings] = useState<AIFinding[]>([])
  const [aiRunning, setAiRunning] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [aiCategories, setAiCategories] = useState<string[]>(['bug', 'security'])
  const AI_CATS = ['bug', 'security', 'performance', 'maintainability', 'readability', 'code_quality']

  // Commits
  const [commits, setCommits] = useState<Commit[]>([])
  const [newCommitMsg, setNewCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)

  // Output and Terminal Panel Resizing (VS Code Style)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200)
  const [isDraggingBottom, setIsDraggingBottom] = useState(false)
  const isDraggingBottomRef = useRef(false)

  const handleStartResizeBottom = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingBottomRef.current = true
    setIsDraggingBottom(true)
    const startY = e.clientY
    const startH = bottomPanelHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingBottomRef.current) return
      const deltaY = startY - ev.clientY
      const maxH = Math.max(window.innerHeight - 150, 400)
      const nextH = Math.min(Math.max(startH + deltaY, 100), maxH)
      setBottomPanelHeight(nextH)
    }

    const onMouseUp = () => {
      isDraggingBottomRef.current = false
      setIsDraggingBottom(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Load project
  useEffect(() => {
    if (!projectId) return
    loadProject()
  }, [projectId])

  // If URL has reviewId, open that review
  useEffect(() => {
    if (urlReviewId && reviews.length > 0) {
      const review = reviews.find(r => r.id === urlReviewId)
      if (review) openReview(review)
    }
  }, [urlReviewId, reviews])

  async function loadProject() {
    setLoading(true)
    try {
      const [projData, fileList, reviewList, commitList] = await Promise.all([
        getProject(projectId!),
        getFiles(projectId!),
        getReviews(projectId!),
        getCommits(projectId!)
      ])
      setProject(projData.project)
      setMyRole(projData.myRole)
      setFiles(fileList)
      setReviews(reviewList)
      setCommits(commitList)

      // Open first non-folder file by default
      const firstFile = fileList.find(f => !f.isFolder)
      if (firstFile) openFile(firstFile)
    } catch {
      setError('Failed to load project. You may not have access.')
    } finally {
      setLoading(false)
    }
  }

  function openFile(file: ProjectFile) {
    if (file.isFolder) {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        if (next.has(file.path)) next.delete(file.path)
        else next.add(file.path)
        return next
      })
      return
    }

    setActiveFile(file)
    setEditorContent(file.content)
    editorContentRef.current = file.content
    setSavedContent(file.content)
    setIsDirty(false)

    setOpenTabs(prev => {
      if (prev.find(t => t.id === file.id)) return prev
      return [...prev, file]
    })
  }

  function closeTab(file: ProjectFile, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const newTabs = openTabs.filter(t => t.id !== file.id)
    setOpenTabs(newTabs)
    if (activeFile?.id === file.id) {
      const next = newTabs[newTabs.length - 1]
      if (next) openFile(next)
      else { setActiveFile(null); setEditorContent('') }
    }
  }

  // Connect to realtime collaboration room
  useEffect(() => {
    if (!projectId) return

    const roomCode = `PROJ-${projectId}`
    const socket = getCollabSocket()

    joinWorkspaceRoom({
      workspaceCode: roomCode,
      userId: user?.id || `anon-${Math.random().toString(36).slice(2, 7)}`,
      name: desiredUsername,
      username: desiredUsername
    })

    const onPresence = (data: { users: CollabUser[] }) => {
      setCollabUsers(data.users || [])
    }

    const onRemoteCursor = (data: RemoteCursorData) => {
      setRemoteCursors(prev => {
        const next = new Map(prev)
        next.set(data.userId, data)
        return next
      })
    }

    const onRemoteCodeChange = (data: { fileName: string; content: string; userId?: string }) => {
      if (data.userId === user?.id) return
      if (activeFile && data.fileName === activeFile.name) {
        const editor = monacoEditorRef.current
        if (editor && editor.getValue() !== data.content) {
          const pos = editor.getPosition()
          const sel = editor.getSelection()
          editor.setValue(data.content)
          if (pos) editor.setPosition(pos)
          if (sel) editor.setSelection(sel)
        }
        editorContentRef.current = data.content
        setEditorContent(data.content)
        setSavedContent(data.content)
        setIsDirty(false)
        setSaveStatus('Saved')
      }
      setFiles(prev => prev.map(f => f.name === data.fileName ? { ...f, content: data.content } : f))
    }

    socket.on('presence_update', onPresence)
    socket.on('remote_cursor', onRemoteCursor)
    socket.on('remote_code_change', onRemoteCodeChange)

    return () => {
      socket.off('presence_update', onPresence)
      socket.off('remote_cursor', onRemoteCursor)
      socket.off('remote_code_change', onRemoteCodeChange)
    }
  }, [projectId, desiredUsername, user?.id, activeFile?.name])

  // Update Monaco remote cursor decorations & widgets
  useEffect(() => {
    const editor = monacoEditorRef.current
    if (!editor || !activeFile) return

    const activeWidgetIds = new Set<string>()

    remoteCursors.forEach((cursor) => {
      if (cursor.userId === user?.id || cursor.fileName !== activeFile.name) return

      const widgetId = `cursor-widget-${cursor.userId}`
      activeWidgetIds.add(widgetId)

      let widget = contentWidgetsRef.current.get(widgetId)
      if (!widget) {
        const domNode = document.createElement('div')
        domNode.className = 'monaco-remote-cursor-container'
        domNode.innerHTML = `
          <div class="monaco-remote-cursor-tag" style="background-color: ${cursor.color}">
            ${cursor.name}
          </div>
          <div class="monaco-remote-cursor-line" style="background-color: ${cursor.color}"></div>
        `

        let currentLine = cursor.line
        let currentCol = cursor.ch

        widget = {
          getId: () => widgetId,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: { lineNumber: currentLine, column: currentCol },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
          })
        }

        contentWidgetsRef.current.set(widgetId, widget)
        try {
          editor.addContentWidget(widget)
        } catch {}
      } else {
        const domNode = widget.getDomNode()
        const tag = domNode.querySelector('.monaco-remote-cursor-tag') as HTMLElement
        if (tag) {
          tag.textContent = cursor.name
          tag.style.backgroundColor = cursor.color
        }
        const line = domNode.querySelector('.monaco-remote-cursor-line') as HTMLElement
        if (line) {
          line.style.backgroundColor = cursor.color
        }

        widget.getPosition = () => ({
          position: { lineNumber: cursor.line, column: cursor.ch },
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
        })
        try {
          editor.layoutContentWidget(widget)
        } catch {}
      }
    })

    contentWidgetsRef.current.forEach((widget, id) => {
      if (!activeWidgetIds.has(id)) {
        try {
          editor.removeContentWidget(widget)
        } catch {}
        contentWidgetsRef.current.delete(id)
      }
    })
  }, [remoteCursors, activeFile, user?.id])

  function handleEditorChange(value?: string) {
    const content = value ?? ''
    editorContentRef.current = content
    const dirty = content !== savedContent
    if (dirty && !isDirty) {
      setIsDirty(true)
      setSaveStatus('Unsaved changes')
    }

    // Broadcast code change to collaborators
    if (projectId && activeFile) {
      sendCodeChange({
        workspaceCode: `PROJ-${projectId}`,
        fileName: activeFile.name,
        content
      })
    }

    // Autosave after 1.5s if enabled
    if (autoSaveEnabled) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const latest = editorContentRef.current
        if (latest !== savedContent) {
          setSaveStatus('Saving…')
          await saveFile(latest)
          setSaveStatus('Saved')
        }
      }, 1500)
    }

    // Debounced static analysis — 600ms (cheap, local, 0 tokens)
    if (staticDebounceRef.current) clearTimeout(staticDebounceRef.current)
    staticDebounceRef.current = setTimeout(() => {
      if (activeFile) {
        const lang = fileLanguage(activeFile)
        analyzeCode(projectId!, { code: content, language: lang, fileName: activeFile.name })
          .then(findings => {
            setProblems(findings)
            applyStaticMarkers(findings)
          })
          .catch(() => {})
      }
    }, 600)
  }

  function applyStaticMarkers(findings: Array<{ line: number; severity: string; message: string; rule?: string }>) {
    const editor = monacoEditorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const markers: monaco.editor.IMarkerData[] = findings.map(p => ({
      severity:
        p.severity === 'error' ? monaco.MarkerSeverity.Error
        : p.severity === 'warning' ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Info,
      startLineNumber: p.line,
      startColumn: 1,
      endLineNumber: p.line,
      endColumn: model.getLineMaxColumn(p.line),
      message: p.message,
      source: 'codenest'
    }))
    monaco.editor.setModelMarkers(model, 'codenest-static', markers)
  }

  async function saveFile(content?: string) {
    if (!activeFile || !projectId) return
    const toSave = content ?? monacoEditorRef.current?.getValue() ?? editorContentRef.current ?? editorContent
    setSaveStatus('Saving…')
    try {
      const updated = await updateFile(projectId, activeFile.id, { content: toSave })
      setSavedContent(toSave)
      setIsDirty(false)
      setSaveStatus('Saved')
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f))
      setOpenTabs(prev => prev.map(t => t.id === updated.id ? updated : t))
      setActiveFile(updated)
    } catch (e) {
      console.error('Save failed', e)
      setSaveStatus('Unsaved changes')
    }
  }

  async function handleInteractiveSubmit(val: string) {
    if (!val.trim()) return
    setStdinInput(val)
    await handleRun(val)
  }

  async function handleRun(overrideStdin?: string) {
    if (!activeFile || !projectId) return

    const lang = fileLanguage(activeFile)
    const currentCode = monacoEditorRef.current?.getValue() ?? editorContentRef.current ?? editorContent

    // HTML/CSS or Web project — live preview in iframe instead of container execution
    if (lang === 'html' || lang === 'css' || (project?.language === 'HTML/CSS/JS' && lang === 'javascript')) {
      setPanelTab('output')
      const htmlFile = files.find(f => f.name.endsWith('.html'))
      const cssFile = files.find(f => f.name.endsWith('.css'))
      const jsFile = files.find(f => f.name.endsWith('.js'))

      const htmlContent = activeFile.name.endsWith('.html') ? currentCode : (htmlFile?.content || '<h1>Preview</h1>')
      const cssContent = activeFile.name.endsWith('.css') ? currentCode : (cssFile?.content || '')
      const jsContent = activeFile.name.endsWith('.js') ? currentCode : (jsFile?.content || '')

      let combinedSrc = htmlContent
        .replace(/<link[^>]*href=["'][^"']*style\.css["'][^>]*>/gi, '')
        .replace(/<script[^>]*src=["'][^"']*script\.js["'][^>]*>\s*<\/script>/gi, '')
      if (cssContent && !combinedSrc.includes(cssContent)) {
        combinedSrc = combinedSrc.replace('</head>', `<style>${cssContent}</style></head>`)
      }
      if (jsContent && !combinedSrc.includes(jsContent)) {
        combinedSrc = combinedSrc.replace('</body>', `<script>${jsContent}</script></body>`)
      }

      setPreviewSrc(combinedSrc)
      setOutput('')
      setExecutionResult(null)
      setAiDiagnosis(null)
      return
    }

    setRunning(true)
    setPanelTab('output')
    setOutput('Compiling and executing...')
    setExecutionResult(null)
    setPreviewSrc(null)
    setAiDiagnosis(null)

    try {
      const detectedLang = lang
      const execLang = (['javascript', 'typescript', 'python'].includes(detectedLang))
        ? detectedLang
        : langId(project?.language || 'JavaScript')

      const activeStdin = overrideStdin !== undefined ? overrideStdin : stdinInput
      const result: ExecutionResult = await executeCode(projectId, {
        code: currentCode,
        language: execLang,
        stdin: activeStdin
      })

      setExecutionResult(result)

      if (result.waitingForInput) {
        setExecutionStatus('Waiting for Input')
        setOutput(cleanTerminalOutput(result.stdout) || 'Program is waiting for input...')
        setInteractiveInput('')
        return
      }

      let outputText = ''
      const cleanStdout = cleanTerminalOutput(result.stdout)
      const cleanStderr = cleanTerminalOutput(result.stderr)
      const cleanCompile = cleanTerminalOutput(result.compileOutput)

      if (cleanCompile) outputText += `[Compilation]\n${cleanCompile}\n\n`
      if (cleanStdout) outputText += cleanStdout
      if (cleanStderr) outputText += (outputText ? '\n\n' : '') + `[Stderr / Errors]\n${cleanStderr}`
      if (!outputText) outputText = '[Program executed with no output]'

      setOutput(outputText)
      setExecutionStatus(result.status)
    } catch {
      setOutput('Execution failed. Please check your connection or local runtime.')
    } finally {
      setRunning(false)
    }
  }

  // AI Targeted Error Diagnosis (Zero Token Waste, strictly on demand)
  async function handleDiagnoseError() {
    if (!activeFile || !projectId) return
    setDiagnosing(true)
    try {
      const errOutput = executionResult?.stderr || executionResult?.compileOutput || output || 'Execution error'
      const diagnosis = await diagnoseProjectError(projectId, {
        code: editorContent,
        language: fileLanguage(activeFile),
        errorOutput: errOutput,
        fileName: activeFile.name
      })
      setAiDiagnosis(diagnosis)
      setPanelTab('output')
    } catch {
      alert('Could not generate error diagnosis. Please try again.')
    } finally {
      setDiagnosing(false)
    }
  }

  function handleApplyDiagnosisFix() {
    if (!aiDiagnosis?.fixedCode) return
    if (aiDiagnosis.line && aiDiagnosis.line > 0) {
      const lines = editorContent.split('\n')
      if (aiDiagnosis.line <= lines.length) {
        lines[aiDiagnosis.line - 1] = aiDiagnosis.fixedCode
        const updated = lines.join('\n')
        setEditorContent(updated)
        setIsDirty(true)
        if (autoSaveEnabled) saveFile(updated)
        setAiDiagnosis(null)
        return
      }
    }
    setEditorContent(aiDiagnosis.fixedCode)
    setIsDirty(true)
    if (autoSaveEnabled) saveFile(aiDiagnosis.fixedCode)
    setAiDiagnosis(null)
  }

  async function handleAnalyze() {
    if (!activeFile || !projectId) return
    setAnalyzing(true)
    setPanelTab('problems')
    try {
      const detectedLang = fileLanguage(activeFile)
      const lang = (['javascript', 'typescript', 'python', 'html', 'css'].includes(detectedLang))
        ? detectedLang
        : langId(project?.language || 'JavaScript')

      const findings = await analyzeCode(projectId, {
        code: editorContent,
        language: lang,
        fileName: activeFile.name
      })
      setProblems(findings)
      applyStaticMarkers(findings)
    } catch {
      console.error('Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  function handleApplyFix(f: AIFinding) {
    if (f.currentCode && f.suggestedCode && editorContent.includes(f.currentCode)) {
      const updated = editorContent.replace(f.currentCode, f.suggestedCode)
      setEditorContent(updated)
      setIsDirty(true)
      setAiFindings(prev => prev.filter(item => item.id !== f.id))
    } else if (f.suggestedCode && f.line) {
      const lines = editorContent.split('\n')
      if (f.line <= lines.length) {
        lines[f.line - 1] = f.suggestedCode
        const updated = lines.join('\n')
        setEditorContent(updated)
        setIsDirty(true)
        setAiFindings(prev => prev.filter(item => item.id !== f.id))
      }
    }
  }

  function handleDismissFinding(findingId?: string) {
    if (!findingId) return
    setAiFindings(prev => prev.filter(f => f.id !== findingId))
  }

  async function handleNewFile(name: string, isFolder: boolean, parentPath?: string) {
    if (!projectId) return
    const path = parentPath ? `${parentPath}/${name}` : name
    try {
      const file = await createFile(projectId, { name, path, isFolder, parentPath })
      setFiles(prev => [...prev, file])
      if (!isFolder) openFile(file)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error || 'Failed to create file')
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    if (!projectId) return
    if (!confirm(`Delete "${file.name}"?`)) return
    try {
      await deleteFile(projectId, file.id)
      setFiles(prev => prev.filter(f => f.id !== file.id))
      closeTab(file, new MouseEvent('') as unknown as React.MouseEvent)
    } catch {
      alert('Failed to delete file')
    }
  }

  async function openReview(review: Review) {
    setActiveReview(review)
    setRightTab('review')
    if (!projectId) return
    try {
      const comments = await getComments(projectId, review.id)
      setReviewComments(comments)
      // Load AI findings
      const fullReview = await getReview(projectId, review.id) as unknown as Record<string, unknown>
      if (fullReview.aiFindings) setAiFindings(fullReview.aiFindings as unknown as AIFinding[])
    } catch {}
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim() || !activeReview || !projectId) return
    setSubmittingComment(true)
    try {
      const comment = await addComment(projectId, {
        reviewId: activeReview.id,
        body: newComment.trim()
      })
      setReviewComments(prev => [...prev, comment])
      setNewComment('')
    } catch {
      alert('Failed to add comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleCreateReview(e: React.FormEvent) {
    e.preventDefault()
    if (!newReviewTitle.trim() || !projectId) return
    setCreatingReview(true)
    try {
      const review = await createReview(projectId, {
        title: newReviewTitle.trim(),
        fileIds: activeFile ? [activeFile.id] : []
      })
      setReviews(prev => [review, ...prev])
      setActiveReview(review)
      setReviewComments([])
      setNewReviewTitle('')
      setShowCreateReview(false)
    } catch {
      alert('Failed to create review')
    } finally {
      setCreatingReview(false)
    }
  }

  async function handleReviewAction(status: string) {
    if (!activeReview || !projectId) return
    try {
      const updated = await updateReview(projectId, activeReview.id, { status })
      setActiveReview(updated)
      setReviews(prev => prev.map(r => r.id === updated.id ? updated : r))
    } catch {
      alert('Action failed')
    }
  }

  async function handleAIReview() {
    if (!activeFile || !projectId) return
    setAiRunning(true)
    setRightTab('ai')
    setAiUnavailable(false)
    try {
      let targetReviewId = activeReview?.id
      if (!targetReviewId) {
        if (reviews.length > 0) {
          targetReviewId = reviews[0].id
          setActiveReview(reviews[0])
        } else {
          const quickReview = await createReview(projectId, {
            title: `Quick Review: ${activeFile.name}`,
            fileIds: [activeFile.id]
          })
          setReviews(prev => [quickReview, ...prev])
          setActiveReview(quickReview)
          targetReviewId = quickReview.id
        }
      }

      const result = await runAIReview(projectId, {
        code: editorContent,
        language: langId(project?.language || 'JavaScript'),
        fileName: activeFile.name,
        categories: aiCategories,
        reviewId: targetReviewId
      })
      setAiFindings(result.findings)
      setAiSummary(result.summary)

      // Set AI markers in Monaco
      const editor = monacoEditorRef.current
      const model = editor?.getModel()
      if (model) {
        const aiMarkers: monaco.editor.IMarkerData[] = result.findings
          .filter(f => f.line != null)
          .map(f => ({
            severity:
              f.severity === 'critical' || f.severity === 'high' ? monaco.MarkerSeverity.Error
              : f.severity === 'medium' ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
            startLineNumber: f.line!,
            startColumn: 1,
            endLineNumber: f.line!,
            endColumn: model.getLineMaxColumn(f.line!),
            message: `${f.title}: ${f.description}`,
            source: 'codenest-ai'
          }))
        monaco.editor.setModelMarkers(model, 'codenest-ai', aiMarkers)
      }
    } catch {
      setAiUnavailable(true)
    } finally {
      setAiRunning(false)
    }
  }

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault()
    if (!newCommitMsg.trim() || !projectId) return
    setCommitting(true)
    try {
      const commit = await createCommit(projectId, {
        message: newCommitMsg.trim(),
        fileIds: openTabs.map(t => t.id)
      })
      setCommits(prev => [commit, ...prev])
      setNewCommitMsg('')
    } catch {
      alert('Failed to create commit')
    } finally {
      setCommitting(false)
    }
  }

  // File tree rendering
  function getChildren(parentPath?: string): ProjectFile[] {
    return files.filter(f => {
      if (!parentPath) {
        return !f.parentPath
      }
      return f.parentPath === parentPath
    }).sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  function FileTreeNode({ file, depth }: { file: ProjectFile; depth: number }) {
    const isExpanded = expandedFolders.has(file.path)
    const isActive = activeFile?.id === file.id
    const children = file.isFolder ? getChildren(file.path) : []

    return (
      <>
        <button
          className={`file-tree-item ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => openFile(file)}
          title={file.path}
        >
          {file.isFolder ? (
            isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : (
            <span className="file-tree-spacer" />
          )}
          {file.isFolder ? <Folder size={14} className="file-tree-folder-icon" /> : <FileCode2 size={14} className="file-tree-file-icon" />}
          <span className="file-tree-name truncate">{file.name}</span>
          {!file.isFolder && isDirty && isActive && <span className="file-modified-dot" />}
          <button
            className="file-tree-delete-btn"
            onClick={e => { e.stopPropagation(); handleDeleteFile(file) }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </button>
        {file.isFolder && isExpanded && (
          children.map(child => <FileTreeNode key={child.id} file={child} depth={depth + 1} />)
        )}
      </>
    )
  }

  const rootFiles = getChildren()
  const canEdit = ['Owner', 'Developer'].includes(myRole)
  const canReview = ['Owner', 'Developer', 'Reviewer'].includes(myRole)

  if (loading) {
    return (
      <div className="ide-loading">
        <div className="spinner" />
        <span>Loading workspace...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ide-error">
        <AlertCircle size={32} />
        <h2>{error}</h2>
        <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="ide">
      {/* ── IDE Header ─────────────────────────────────── */}
      <header className="ide-header">
        <div className="ide-header-left">
          <Link to="/dashboard" style={{ textDecoration: 'none' }}><Logo size="xs" /></Link>
          <span className="ide-divider" />
          <button className="ide-project-name">
            {project?.name} <ChevronDown size={13} />
          </button>
          <span className="ide-branch"><GitBranch size={13} /> main</span>
        </div>

        <div className="ide-header-center">
          {activeFile && (
            <span className="ide-active-file">
              <FileCode2 size={13} />
              {activeFile.path}
              {isDirty && <span className="ide-dirty-dot" />}
            </span>
          )}
        </div>

        <div className="ide-header-right">
          <button
            className={`ide-autosave-toggle ${autoSaveEnabled ? 'active' : ''}`}
            onClick={() => {
              setAutoSaveEnabled(prev => {
                const nextVal = !prev
                try { localStorage.setItem('codenest_autosave', String(nextVal)) } catch {}
                return nextVal
              })
            }}
            title={autoSaveEnabled ? "Auto-Save is ON (Changes save automatically)" : "Auto-Save is OFF (Click to turn on)"}
          >
            <Zap size={13} fill={autoSaveEnabled ? 'currentColor' : 'none'} />
            <span>Auto-Save: {autoSaveEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            className={`ide-collab-btn ${showCollabModal ? 'active' : ''}`}
            onClick={() => setShowCollabModal(true)}
            title="Collaborate in real time with shared link"
          >
            <Users size={13} />
            <span>Collab</span>
            <span className="ide-collab-badge">{collabUsers.length || 1}</span>
          </button>

          <span className={`ide-save-state ${isDirty ? 'unsaved' : ''}`}>
            {saveStatus === 'Saving…' ? 'Saving…' : isDirty ? 'Unsaved changes' : <><Check size={13} /> Saved</>}
          </span>

          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => saveFile()} disabled={!isDirty} title="Save (Ctrl+S)">
              <Save size={14} /> Save
            </button>
          )}

          <button
            className={`ide-run-btn ${running ? 'running' : ''}`}
            onClick={() => handleRun()}
            disabled={running || !activeFile}
          >
            <Play size={14} fill="currentColor" />
            {running ? 'Running…' : 'Run'}
          </button>

          <button
            className={`btn btn-secondary btn-sm ${analyzing ? 'btn-loading' : ''}`}
            onClick={handleAnalyze}
            disabled={analyzing || !activeFile}
            title="Run static code quality rules"
          >
            <AlertTriangle size={14} />
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>

          {canReview && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setRightTab('review'); setShowCreateReview(true) }}>
              <MessageSquareText size={14} /> Review
            </button>
          )}

          <div className="avatar-stack">
            {project?.members?.slice(0, 4).map(m => (
              <div key={m.id} className="avatar avatar-sm" title={m.user.name}>{m.user.avatarInitials}</div>
            ))}
          </div>

          <Link to="/dashboard" className="btn btn-ghost btn-icon" title="Notifications">
            <Bell size={16} />
          </Link>
        </div>
      </header>

      {/* ── IDE Body ───────────────────────────────────── */}
      <div className="ide-body">
        {/* File Explorer */}
        <aside className="ide-explorer" style={{ width: explorerWidth }}>
          <div className="ide-explorer-header">
            <span>EXPLORER</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowNewFile(true)} title="New file"><Plus size={15} /></button>
          </div>

          <div className="ide-file-tree">
            {rootFiles.length === 0 ? (
              <div className="ide-explorer-empty">
                <p>No files yet.</p>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNewFile(true)}>
                  <Plus size={13} /> Create file
                </button>
              </div>
            ) : (
              rootFiles.map(f => <FileTreeNode key={f.id} file={f} depth={0} />)
            )}
          </div>

          <div className="ide-explorer-bottom">
            <button className="ide-sidebar-btn" onClick={handleAnalyze} disabled={!activeFile}>
              <CircleDot size={15} /> Problems {problems.length > 0 && <b>{problems.length}</b>}
            </button>
            <button className="ide-sidebar-btn" onClick={() => setRightTab('commits')}>
              <GitCommitHorizontal size={15} /> Commits
            </button>
          </div>
        </aside>

        {/* Main Editor Area */}
        <main className="ide-editor-area">
          {/* Tabs & View Mode Toggle */}
          <div className="ide-tabs-bar">
            <div className="ide-tabs">
              {openTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`ide-tab ${activeFile?.id === tab.id ? 'active' : ''}`}
                  onClick={() => openFile(tab)}
                >
                  <FileCode2 size={13} />
                  <span>{tab.name}</span>
                  {isDirty && activeFile?.id === tab.id
                    ? <span className="ide-tab-dirty" />
                    : <span className="ide-tab-close" onClick={e => closeTab(tab, e)}><X size={12} /></span>
                  }
                </button>
              ))}
            </div>

            {activeFile && (
              <div className="ide-view-toggle">
                <button
                  className={`ide-view-btn ${viewMode === 'editor' ? 'active' : ''}`}
                  onClick={() => {
                    setViewMode('editor')
                    setTimeout(() => {
                      monacoEditorRef.current?.layout()
                    }, 50)
                  }}
                  title="Source Code Editor"
                >
                  <Code2 size={13} /> Code
                </button>
                <button
                  className={`ide-view-btn ${viewMode === 'diff' ? 'active' : ''}`}
                  onClick={() => setViewMode('diff')}
                  title="Side-by-side Git Diff (Saved vs Working Copy)"
                >
                  <GitCommitHorizontal size={13} /> Diff
                </button>
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="ide-monaco" style={{ position: 'relative' }}>
            {activeFile ? (
              <>
                <div style={{ width: '100%', height: '100%', display: viewMode === 'editor' ? 'block' : 'none' }}>
                  <Editor
                    key={activeFile.name}
                    path={activeFile.name}
                    height="100%"
                    language={fileLanguage(activeFile)}
                    defaultValue={activeFile.content}
                    onChange={handleEditorChange}
                    theme="vs-dark"
                    options={{
                      fontSize: 14,
                      fontFamily: 'JetBrains Mono, Consolas, monospace',
                      minimap: { enabled: false },
                      padding: { top: 12, bottom: 12 },
                      scrollBeyondLastLine: false,
                      lineNumbersMinChars: 3,
                      automaticLayout: true,
                      readOnly: !canEdit,
                      wordWrap: 'on',
                      contextmenu: true,
                      smoothScrolling: true,
                      cursorSmoothCaretAnimation: 'on',
                      renderLineHighlight: 'line',
                      bracketPairColorization: { enabled: true }
                    }}
                    onMount={(editor) => {
                      monacoEditorRef.current = editor
                      // Ctrl+S to save
                      editor.addCommand(2048 + 49 /* Ctrl+S */, () => saveFile())

                      // Broadcast cursor movements to collaborators & update status bar throttled
                      editor.onDidChangeCursorPosition((e) => {
                        if (cursorPosThrottleRef.current) clearTimeout(cursorPosThrottleRef.current)
                        cursorPosThrottleRef.current = setTimeout(() => {
                          setCursorPos({ line: e.position.lineNumber, col: e.position.column })
                        }, 60)

                        const now = Date.now()
                        if (now - cursorThrottleRef.current > 50) {
                          cursorThrottleRef.current = now
                          if (projectId && activeFile) {
                            sendCursorMove({
                              workspaceCode: `PROJ-${projectId}`,
                              fileName: activeFile.name,
                              line: e.position.lineNumber,
                              ch: e.position.column
                            })
                          }
                        }
                      })
                    }}
                  />
                </div>
                <div style={{ width: '100%', height: '100%', display: viewMode === 'diff' ? 'block' : 'none' }}>
                  <SafeDiffViewer
                    original={savedContent}
                    modified={editorContent}
                    language={fileLanguage(activeFile)}
                    active={viewMode === 'diff'}
                  />
                </div>
              </>
            ) : (
              <div className="ide-no-file">
                <Code2 size={36} />
                <h3>No file open</h3>
                <p>Select a file from the explorer or create a new one.</p>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewFile(true)}>
                  <Plus size={14} /> New file
                </button>
              </div>
            )}
          </div>

          {/* Collab indicator (simulated) */}
          {activeFile && (
            <div className="ide-collab-bar">
              <span className="ide-collab-status"><i /> Connected</span>
              <span className="ide-collab-users">
                {project?.members?.slice(0, 3).map(m => (
                  <span key={m.id} className="avatar avatar-sm" title={m.user.name + ' — ' + m.role}>{m.user.avatarInitials}</span>
                ))}
              </span>
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside className="ide-right-panel">
          {/* Right panel tabs */}
          <div className="ide-right-tabs">
            <button className={`ide-right-tab ${rightTab === 'review' ? 'active' : ''}`} onClick={() => setRightTab('review')}>
              <MessageSquareText size={14} /> Review
            </button>
            <button className={`ide-right-tab ${rightTab === 'ai' ? 'active' : ''}`} onClick={() => setRightTab('ai')}>
              <Sparkles size={14} /> AI
            </button>
            <button className={`ide-right-tab ${rightTab === 'members' ? 'active' : ''}`} onClick={() => setRightTab('members')}>
              <Users size={14} />
            </button>
            <button className={`ide-right-tab ${rightTab === 'commits' ? 'active' : ''}`} onClick={() => setRightTab('commits')}>
              <GitCommitHorizontal size={14} />
            </button>
          </div>

          {/* Review Panel */}
          {rightTab === 'review' && (
            <div className="ide-review-panel">
              {/* Create review form */}
              {showCreateReview && (
                <form onSubmit={handleCreateReview} className="ide-create-review">
                  <div className="ide-panel-section-label">NEW REVIEW</div>
                  <input
                    className="form-input"
                    placeholder="Review title..."
                    value={newReviewTitle}
                    onChange={e => setNewReviewTitle(e.target.value)}
                    autoFocus
                    required
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className={`btn btn-primary btn-sm ${creatingReview ? 'btn-loading' : ''}`} disabled={creatingReview}>
                      {!creatingReview && 'Create'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateReview(false)}>Cancel</button>
                  </div>
                </form>
              )}

              {/* Reviews list */}
              {!activeReview && !showCreateReview && (
                <div className="ide-reviews-list">
                  <div className="ide-panel-section-label">
                    REVIEWS <span>{reviews.length}</span>
                  </div>
                  {reviews.length === 0 ? (
                    <div className="ide-panel-empty">
                      <p>No reviews yet.</p>
                      {canReview && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateReview(true)}>
                          <Plus size={13} /> Create review
                        </button>
                      )}
                    </div>
                  ) : (
                    reviews.map(r => (
                      <button key={r.id} className="ide-review-item" onClick={() => openReview(r)}>
                        <div className="ide-review-item-top">
                          <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                          <span className="ide-review-time">{timeAgo(r.updatedAt)}</span>
                        </div>
                        <b>{r.title}</b>
                        <span>{r._count?.comments || 0} comments</span>
                      </button>
                    ))
                  )}
                  {canReview && reviews.length > 0 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: '8px' }} onClick={() => setShowCreateReview(true)}>
                      <Plus size={13} /> New review
                    </button>
                  )}
                </div>
              )}

              {/* Active review */}
              {activeReview && (
                <div className="ide-active-review">
                  <div className="ide-active-review-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setActiveReview(null); setReviewComments([]) }}>
                      ← Back
                    </button>
                    <span className={`badge ${statusBadgeClass(activeReview.status)}`}>{statusLabel(activeReview.status)}</span>
                  </div>

                  <h3 className="ide-review-title">{activeReview.title}</h3>
                  {activeReview.description && <p className="ide-review-desc">{activeReview.description}</p>}

                  {/* Review creator */}
                  <div className="ide-review-meta">
                    <div className="avatar avatar-sm">{activeReview.creator?.avatarInitials || '??'}</div>
                    <span>{activeReview.creator?.name} created this review</span>
                  </div>

                  {/* Review actions */}
                  {canReview && activeReview.status !== 'resolved' && (
                    <div className="ide-review-actions">
                      {activeReview.status !== 'approved' && (
                        <button className="btn btn-sm" style={{ background: 'var(--success-dim)', color: 'var(--success)' }} onClick={() => handleReviewAction('approved')}>
                          <Check size={13} /> Approve
                        </button>
                      )}
                      {activeReview.status !== 'changes_requested' && (
                        <button className="btn btn-sm" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }} onClick={() => handleReviewAction('changes_requested')}>
                          <RefreshCw size={13} /> Request changes
                        </button>
                      )}
                      {activeReview.status !== 'resolved' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleReviewAction('resolved')}>
                          Resolve
                        </button>
                      )}
                    </div>
                  )}

                  {/* Comments */}
                  <div className="ide-panel-section-label">
                    COMMENTS <span>{reviewComments.length}</span>
                  </div>

                  <div className="ide-comments">
                    {reviewComments.length === 0 ? (
                      <p className="ide-no-comments">No comments yet. Be the first to comment.</p>
                    ) : (
                      reviewComments.map(c => (
                        <div key={c.id} className={`ide-comment ${c.resolved ? 'resolved' : ''}`}>
                          <div className="avatar avatar-sm">{c.author.avatarInitials}</div>
                          <div className="ide-comment-body">
                            <div className="ide-comment-header">
                              <b>{c.author.name}</b>
                              <span>{timeAgo(c.createdAt)}</span>
                              {c.line && <span className="ide-comment-line">Line {c.line}</span>}
                            </div>
                            <p>{c.body}</p>
                            {canReview && !c.resolved && (
                              <button
                                className="btn btn-ghost"
                                style={{ fontSize: '11px', padding: '2px 6px' }}
                                onClick={() => resolveComment(projectId!, c.id, true).then(() =>
                                  setReviewComments(prev => prev.map(x => x.id === c.id ? { ...x, resolved: true } : x))
                                )}
                              >
                                Resolve
                              </button>
                            )}
                            {c.resolved && <span className="ide-comment-resolved"><Check size={11} /> Resolved</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add comment */}
                  {canReview && (
                    <form onSubmit={handleSubmitComment} className="ide-comment-form">
                      <div className="avatar avatar-sm">{user?.avatarInitials}</div>
                      <div style={{ flex: 1, display: 'flex', gap: '6px', flexDirection: 'column' }}>
                        <textarea
                          className="form-textarea"
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          rows={2}
                        />
                        <button
                          type="submit"
                          className={`btn btn-primary btn-sm ${submittingComment ? 'btn-loading' : ''}`}
                          disabled={!newComment.trim() || submittingComment}
                        >
                          {!submittingComment && <>Comment <ArrowRight size={13} /></>}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI Panel */}
          {rightTab === 'ai' && (
            <div className="ide-ai-panel">
              <div className="ide-panel-section-label">AI QUALITY CHECKS</div>
              <p className="ide-ai-desc">
                Gemini provides targeted analysis on demand. Select categories and click Run.
              </p>

              {aiUnavailable && (
                <div className="ide-ai-unavailable">
                  <Info size={13} /> AI review temporarily unavailable. Showing static analysis only.
                </div>
              )}

              <div className="ide-ai-categories">
                {AI_CATS.map(cat => (
                  <button
                    key={cat}
                    className={`ide-ai-cat-btn ${aiCategories.includes(cat) ? 'selected' : ''}`}
                    onClick={() => setAiCategories(prev =>
                      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                    )}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <button
                className={`ide-ai-run-btn ${aiRunning ? 'btn-loading' : ''}`}
                onClick={handleAIReview}
                disabled={aiRunning || !activeFile || aiCategories.length === 0}
              >
                {!aiRunning && <><Sparkles size={15} /> Run quality check</>}
              </button>

              {!activeReview && reviews.length > 0 && (
                <p className="ide-ai-note">Attaching to review: <b>{reviews[0].title}</b></p>
              )}
              {!activeReview && reviews.length === 0 && (
                <p className="ide-ai-note">A review session will be automatically created for this file.</p>
              )}

              {aiSummary && (
                <div className="ide-ai-summary">
                  <b>Summary</b>
                  <p>{aiSummary}</p>
                </div>
              )}

              {aiFindings.length > 0 && (
                <div className="ide-ai-findings">
                  <div className="ide-panel-section-label">FINDINGS <span>{aiFindings.length}</span></div>
                  {aiFindings.map(f => (
                    <div key={f.id} className={`ide-finding ide-finding-${f.severity}`}>
                      <div className="ide-finding-top">
                        <span className={`badge ${f.severity === 'high' || f.severity === 'critical' ? 'badge-red' : f.severity === 'medium' ? 'badge-yellow' : 'badge-muted'}`}>
                          {f.severity}
                        </span>
                        <span className="ide-finding-cat">{f.category.replace('_', ' ')}</span>
                        <button className="ide-finding-dismiss-btn" onClick={() => handleDismissFinding(f.id)} title="Dismiss this finding">
                          <X size={12} />
                        </button>
                      </div>
                      <div className="ide-finding-file">{f.file}{f.line ? `:${f.line}` : ''}</div>
                      <h4>{f.title}</h4>
                      <p>{f.description}</p>
                      {f.suggestion && (
                        <div className="ide-finding-suggestion">
                          <b>Suggestion</b>
                          <p>{f.suggestion}</p>
                        </div>
                      )}
                      {(f.suggestedCode || f.currentCode) && (
                        <div className="ide-finding-code-diff">
                          {f.currentCode && (
                            <pre className="ide-code-current"><code>- {f.currentCode}</code></pre>
                          )}
                          {f.suggestedCode && (
                            <pre className="ide-code-suggested"><code>+ {f.suggestedCode}</code></pre>
                          )}
                          <div className="ide-finding-actions">
                            {f.suggestedCode && (
                              <button className="btn btn-primary btn-xs" onClick={() => handleApplyFix(f)}>
                                <Check size={12} /> Apply Fix
                              </button>
                            )}
                            <button className="btn btn-ghost btn-xs" onClick={() => handleDismissFinding(f.id)}>
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {aiFindings.length === 0 && !aiRunning && aiSummary && (
                <div className="ide-panel-empty">
                  <Check size={20} style={{ color: 'var(--success)' }} />
                  <p>No issues found in selected categories.</p>
                </div>
              )}
            </div>
          )}

          {/* Members Panel */}
          {rightTab === 'members' && (
            <div className="ide-members-panel">
              <div className="ide-panel-section-label">TEAM MEMBERS</div>
              {project?.members?.map(m => (
                <div key={m.id} className="ide-member">
                  <div className="avatar avatar-sm">{m.user.avatarInitials}</div>
                  <div className="ide-member-info">
                    <b>{m.user.name}</b>
                    <span>@{m.user.username}</span>
                  </div>
                  <span className={`badge ${m.role === 'Owner' ? 'badge-purple' : 'badge-muted'}`}>{m.role}</span>
                </div>
              ))}
            </div>
          )}

          {/* Commits Panel */}
          {rightTab === 'commits' && (
            <div className="ide-commits-panel">
              <div className="ide-panel-section-label">COMMITS</div>

              {canEdit && (
                <form onSubmit={handleCommit} className="ide-commit-form">
                  <input
                    className="form-input"
                    placeholder="Commit message..."
                    value={newCommitMsg}
                    onChange={e => setNewCommitMsg(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className={`btn btn-primary btn-sm btn-full ${committing ? 'btn-loading' : ''}`}
                    disabled={committing || !newCommitMsg.trim()}
                  >
                    {!committing && <><GitCommitHorizontal size={14} /> Commit</>}
                  </button>
                </form>
              )}

              <div className="ide-commit-list">
                {commits.length === 0 ? (
                  <p className="ide-no-commits">No commits yet.</p>
                ) : (
                  commits.map(c => (
                    <div key={c.id} className="ide-commit">
                      <div className="ide-commit-dot" />
                      <div className="ide-commit-info">
                        <b>{c.message}</b>
                        <span>{c.author.name} · {timeAgo(c.createdAt)}</span>
                        {c.fileIds.length > 0 && <span>{c.fileIds.length} files</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ── Bottom Panel ──────────────────────────────── */}
      <div className={`ide-bottom ${isDraggingBottom ? 'dragging' : ''}`} style={{ height: `${bottomPanelHeight}px` }}>
        <div
          className={`ide-panel-resizer-row ${isDraggingBottom ? 'active' : ''}`}
          onMouseDown={handleStartResizeBottom}
          onDoubleClick={() => setBottomPanelHeight(200)}
          title="Drag to expand output & terminal (Double-click to reset)"
        />
        <div className="ide-bottom-tabs">
          <button className={`ide-bottom-tab ${panelTab === 'output' ? 'active' : ''}`} onClick={() => setPanelTab('output')}>
            <Terminal size={13} /> Output
          </button>
          <button className={`ide-bottom-tab ${panelTab === 'problems' ? 'active' : ''}`} onClick={() => setPanelTab('problems')}>
            <CircleDot size={13} /> Problems {problems.length > 0 && <b>{problems.length}</b>}
          </button>
          <button
            className={`ide-bottom-tab ${showStdin ? 'active' : ''}`}
            onClick={() => setShowStdin(!showStdin)}
            title="Terminal Input (stdin) for programs using input() or process.stdin"
          >
            <span>Stdin {stdinInput ? '●' : ''}</span>
          </button>
          <span className="ide-bottom-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setOutput('Ready.')}>
            <X size={13} />
          </button>
        </div>

        <div className="ide-bottom-content">
          {panelTab === 'output' && (
            <div className="ide-output-container">
              {previewSrc ? (
                <iframe
                  className="ide-preview-frame"
                  sandbox="allow-scripts"
                  srcDoc={previewSrc}
                  title="HTML/CSS Preview"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff', pointerEvents: isDraggingBottom ? 'none' : 'auto' }}
                />
              ) : (
                <>
                  {showStdin && (
                    <div style={{ padding: '8px 14px', background: '#141417', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Stdin Input:</span>
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1, fontFamily: 'var(--font-code)', fontSize: '12px', padding: '4px 8px', height: '28px' }}
                        placeholder="Type input for program (e.g. Alice)..."
                        value={stdinInput}
                        onChange={e => setStdinInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRun() }}
                      />
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => handleRun()}
                        disabled={running}
                      >
                        Run with Input
                      </button>
                    </div>
                  )}
                  {executionResult && (
                    <div className="ide-exec-meta-bar">
                      <span className={`ide-meta-badge ${executionResult.exitCode === 0 ? 'badge-ok' : 'badge-err'}`}>
                        STATUS: {executionResult.status}
                      </span>
                      {executionResult.time && (
                        <span className="ide-meta-badge badge-neutral">TIME: {executionResult.time}s</span>
                      )}
                      {executionResult.memory && (
                        <span className="ide-meta-badge badge-neutral">MEMORY: {executionResult.memory}</span>
                      )}
                      <span className="ide-meta-badge badge-neutral">EXIT CODE: {executionResult.exitCode}</span>
                    </div>
                  )}
                  {executionResult && (executionResult.exitCode !== 0 || (executionResult.stderr && executionResult.stderr.trim().length > 0)) && (
                    <div className="terminal-error-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={15} />
                        <span>Execution returned an error. Diagnose instantly with minimal token AI.</span>
                      </div>
                      <button
                        className={`btn btn-secondary btn-sm ${diagnosing ? 'btn-loading' : ''}`}
                        onClick={handleDiagnoseError}
                        disabled={diagnosing}
                        style={{ background: '#1c1c20', borderColor: '#ef4444', color: '#fca5a5' }}
                        title="Diagnose this error with token-optimized AI (<350 tokens)"
                      >
                        <Sparkles size={13} />
                        {diagnosing ? 'Diagnosing…' : 'Fix with AI (Token-Optimized)'}
                      </button>
                    </div>
                  )}

                  {aiDiagnosis && (
                    <div className="ide-error-diagnosis-card">
                      <div className="ide-error-diagnosis-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Sparkles size={14} style={{ color: '#ef4444' }} />
                          <span>AI Error Diagnosis</span>
                          <span className="badge badge-muted" style={{ fontSize: '10px' }}>Minimal Token Mode</span>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={() => setAiDiagnosis(null)} style={{ padding: '2px' }}>
                          <X size={14} />
                        </button>
                      </div>
                      <div className="ide-error-diagnosis-summary">
                        <b>Issue:</b> {aiDiagnosis.errorSummary}
                      </div>
                      {aiDiagnosis.approach && (
                        <div className="ide-error-diagnosis-approach">
                          <b>Approach:</b> {aiDiagnosis.approach}
                        </div>
                      )}
                      {aiDiagnosis.fixedCode && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>
                              Suggested Replacement {aiDiagnosis.line ? `(Line ${aiDiagnosis.line})` : ''}
                            </span>
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={handleApplyDiagnosisFix}
                            >
                              <Check size={12} /> Apply Fix to Editor
                            </button>
                          </div>
                          <pre className="ide-error-diagnosis-code"><code>{aiDiagnosis.fixedCode}</code></pre>
                        </>
                      )}
                    </div>
                  )}
                  <pre className="ide-terminal-output">{output}</pre>

                  {executionResult?.waitingForInput && (
                    <div className="terminal-waiting-input-card">
                      <div className="terminal-waiting-input-label">
                        <span style={{ background: '#eab308', color: '#000', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                          ⌨️ INPUT NEEDED
                        </span>
                        <span>{executionResult.inputPrompt || 'Program is waiting for input:'}</span>
                      </div>
                      <div className="terminal-waiting-input-row">
                        <input
                          type="text"
                          autoFocus
                          className="form-input"
                          style={{ flex: 1, height: '32px', fontFamily: 'var(--font-code)', fontSize: '13px' }}
                          placeholder="Type input and press Enter..."
                          value={interactiveInput}
                          onChange={e => setInteractiveInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInteractiveSubmit(interactiveInput)
                          }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleInteractiveSubmit(interactiveInput)}
                          disabled={running}
                        >
                          Submit ↵
                        </button>
                      </div>
                    </div>
                  )}

                  {!executionResult?.waitingForInput && (
                    <div className="ide-terminal-prompt-bar">
                      <span className="ide-terminal-prompt-prefix">&gt;</span>
                      <input
                        type="text"
                        className="ide-terminal-input-field"
                        placeholder="Send input (stdin) to program..."
                        value={stdinInput}
                        onChange={e => setStdinInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRun(stdinInput)
                        }}
                      />
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleRun(stdinInput)}
                        disabled={running}
                      >
                        Run ↵
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {panelTab === 'problems' && (
            <div className="ide-problems">
              {analyzing && <div className="ide-analyzing"><div className="spinner" /> Analyzing...</div>}
              {!analyzing && problems.length === 0 && (
                <div className="ide-no-problems"><Check size={15} style={{ color: 'var(--success)' }} /> No problems detected.</div>
              )}
              {problems.map((p, i) => (
                <div key={i} className={`ide-problem ide-problem-${p.severity}`}>
                  {p.severity === 'error' ? <AlertCircle size={14} /> : p.severity === 'warning' ? <AlertTriangle size={14} /> : <Info size={14} />}
                  <span className="ide-problem-file">{activeFile?.name}:{p.line}</span>
                  <span>{p.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── IDE Status Bar ───────────────────────────── */}
      <footer className="ide-status-bar">
        <div className="ide-status-bar-left">
          <span className="ide-status-item"><GitBranch size={13} /> main</span>
          <span className="ide-status-item">
            <CircleDot size={13} />
            {problems.filter(p => p.severity === 'error').length} errors,
            {problems.filter(p => p.severity === 'warning').length} warnings
          </span>
          {activeFile && (
            <span className="ide-status-item">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span className="ide-status-item">Spaces: 2</span>
          <span className="ide-status-item">UTF-8</span>
          <span className="ide-status-item">
            {activeFile ? fileLanguage(activeFile).toUpperCase() : (project?.language || 'TEXT')}
          </span>
        </div>

        <div className="ide-status-bar-right">
          <span className="ide-status-item" title={autoSaveEnabled ? "Auto-Save active" : "Auto-Save disabled"}>
            <span className="ide-status-dot" style={{ background: autoSaveEnabled ? '#22c55e' : '#71717a' }} />
            Auto-Save: {autoSaveEnabled ? 'ON' : 'OFF'}
          </span>
          <button
            className="ide-status-item"
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
            onClick={() => setShowCollabModal(true)}
            title="View active collaborators"
          >
            <Users size={12} /> {collabUsers.length || 1} online
          </button>
          <span className="ide-status-item">
            <span className="ide-status-dot" /> Connected
          </span>
        </div>
      </footer>

      {/* Modals */}
      {showNewFile && (
        <NewFileModal
          onClose={() => setShowNewFile(false)}
          onCreate={handleNewFile}
        />
      )}

      {/* Real-time Collaboration Modal */}
      {showCollabModal && (
        <CollabModal
          project={project}
          onClose={() => setShowCollabModal(false)}
        />
      )}
    </div>
  )
}
