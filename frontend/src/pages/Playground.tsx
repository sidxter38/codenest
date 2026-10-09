import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  Play, Sparkles, AlertCircle, FileCode2, Terminal, Eye,
  ChevronDown, Plus, Trash2, X, RefreshCw, Layers, Cpu, Globe,
  ArrowRight, ShieldAlert, CheckCircle2, Clock, FolderTree
} from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import {
  PlaygroundLang, PlaygroundFile, PLAYGROUND_LANGUAGES,
  DEFAULT_PROJECT_FILES, playgroundExecute, playgroundAnalyze, cleanTerminalOutput
} from '../services/playground'
import { ExecutionResult } from '../services/projects'
import { executeJavaScriptInBrowser } from '../services/browserSandbox'
import { useAuth } from '../contexts/AuthContext'
import './Playground.css'

export default function Playground() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  // Selected language environment
  const [currentLang, setCurrentLang] = useState<PlaygroundLang>('html')
  const [files, setFiles] = useState<PlaygroundFile[]>(DEFAULT_PROJECT_FILES['html'])
  const [activeFileName, setActiveFileName] = useState<string>('index.html')

  // Execution & Output state
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'terminal' | 'console'>('preview')
  const [terminalOutput, setTerminalOutput] = useState<string>('$ Program Output\nReady to compile and run.')
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string }>>([])
  const [executionTime, setExecutionTime] = useState<string>('—')
  const [executionStatus, setExecutionStatus] = useState<string>('Ready')
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [stdinInput, setStdinInput] = useState<string>('')
  const [interactiveInput, setInteractiveInput] = useState<string>('')
  const [showStdin, setShowStdin] = useState<boolean>(false)

  // Modals & Popovers
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  // Sizing & Interactive Resizing (VS Code Style)
  const [fileWidth, setFileWidth] = useState(220)
  const [outputWidth, setOutputWidth] = useState(460)
  const [isDraggingOutput, setIsDraggingOutput] = useState(false)
  const isDraggingOutputRef = useRef(false)
  const [isDraggingExplorer, setIsDraggingExplorer] = useState(false)
  const isDraggingExplorerRef = useRef(false)

  const handleStartResizeOutput = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingOutputRef.current = true
    setIsDraggingOutput(true)
    const startX = e.clientX
    const startW = outputWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingOutputRef.current) return
      const delta = startX - ev.clientX
      const maxW = Math.max(window.innerWidth - fileWidth - 140, 360)
      const nextW = Math.min(Math.max(startW + delta, 240), maxW)
      setOutputWidth(nextW)
    }

    const onMouseUp = () => {
      isDraggingOutputRef.current = false
      setIsDraggingOutput(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleStartResizeExplorer = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingExplorerRef.current = true
    setIsDraggingExplorer(true)
    const startX = e.clientX
    const startW = fileWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingExplorerRef.current) return
      const delta = ev.clientX - startX
      const nextW = Math.min(Math.max(startW + delta, 160), 380)
      setFileWidth(nextW)
    }

    const onMouseUp = () => {
      isDraggingExplorerRef.current = false
      setIsDraggingExplorer(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const activeFile = useMemo(() => {
    return files.find(f => f.name === activeFileName) || files[0]
  }, [files, activeFileName])

  // Switch environment when language changes
  function handleSelectLanguage(lang: PlaygroundLang) {
    setCurrentLang(lang)
    const initialFiles = DEFAULT_PROJECT_FILES[lang]
    setFiles(initialFiles)
    setActiveFileName(initialFiles[0].name)
    setShowLangPicker(false)

    // Set default active panel tab based on selected language
    if (lang === 'html') {
      setActiveTab('preview')
      setExecutionStatus('Ready (Live Preview)')
    } else {
      setActiveTab('terminal')
      setTerminalOutput('$ Program Output\nReady to run code in terminal.')
      setExecutionStatus(`Ready (${lang === 'javascript' ? 'Node.js' : 'Python 3'})`)
    }
  }

  // Live Combined HTML/CSS/JS for iframe preview
  const livePreviewHtml = useMemo(() => {
    const rawHtmlFile = files.find(f => f.name.endsWith('.html'))?.content || (activeFile.name.endsWith('.html') ? activeFile.content : '<h1>Live Preview</h1>')
    const cssFile = files.find(f => f.name.endsWith('.css'))?.content || ''
    const jsFile = files.find(f => f.name.endsWith('.js'))?.content || ''

    // Strip relative references to script.js and style.css since we inline them directly
    const htmlFile = rawHtmlFile
      .replace(/<link[^>]*href=["'][^"']*style\.css["'][^>]*>/gi, '')
      .replace(/<script[^>]*src=["'][^"']*script\.js["'][^>]*>\s*<\/script>/gi, '')

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${cssFile}
  </style>
  <script>
    // Trap uncaught errors in iframe and forward to IDE Console without bubbling to parent window
    window.onerror = function(msg, url, line, col, err) {
      const formatted = '[Runtime Error] ' + (err?.message || msg) + (line ? ' (line ' + line + ')' : '');
      window.parent.postMessage({ type: 'iframe_log', logType: 'error', msg: formatted }, '*');
      return true; // Prevents triggering window.onerror in parent window & webpack dev overlay
    };
    window.onunhandledrejection = function(e) {
      const formatted = '[Unhandled Promise] ' + (e.reason?.message || String(e.reason));
      window.parent.postMessage({ type: 'iframe_log', logType: 'error', msg: formatted }, '*');
      return true;
    };

    // Forward iframe console logs to parent IDE console
    const _origLog = console.log;
    const _origError = console.error;
    const _origWarn = console.warn;
    console.log = function(...args) {
      _origLog(...args);
      window.parent.postMessage({ type: 'iframe_log', logType: 'log', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*');
    };
    console.error = function(...args) {
      _origError(...args);
      window.parent.postMessage({ type: 'iframe_log', logType: 'error', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*');
    };
    console.warn = function(...args) {
      _origWarn(...args);
      window.parent.postMessage({ type: 'iframe_log', logType: 'warn', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*');
    };
  </script>
</head>
<body>
  ${htmlFile.includes('<body') ? htmlFile.replace(/<!DOCTYPE html>[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*?<\/html>/i, '') : htmlFile}
  <script>
    try {
      ${jsFile}
    } catch (e) {
      console.error(e.message || String(e));
    }
  </script>
</body>
</html>
`
  }, [files, activeFile])

  // Listen for console logs forwarded from Preview iframe
  useEffect(() => {
    function handleIframeMessage(e: MessageEvent) {
      if (e.data && e.data.type === 'iframe_log') {
        setConsoleLogs(prev => [...prev.slice(-99), { type: e.data.logType, message: e.data.msg }])
      }
    }
    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [])

  const filesRef = useRef(files)
  filesRef.current = files
  const fileUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Handle active file content changes without triggering synchronous Monaco resets
  function handleEditorChange(newContent: string | undefined) {
    const updated = newContent ?? ''
    filesRef.current = filesRef.current.map(f => f.name === activeFile.name ? { ...f, content: updated } : f)
    if (fileUpdateTimerRef.current) clearTimeout(fileUpdateTimerRef.current)
    fileUpdateTimerRef.current = setTimeout(() => {
      setFiles(filesRef.current)
    }, 350)
  }

  async function handleInteractiveSubmit(val: string) {
    if (!val.trim()) return
    setStdinInput(val)
    await handleRun(val)
  }

  // Run Code Action
  async function handleRun(overrideStdin?: string) {
    setRunning(true)
    setExecutionStatus('Running…')
    const t0 = performance.now()

    if (currentLang === 'html') {
      setActiveTab('preview')
      const elapsed = ((performance.now() - t0) / 1000).toFixed(3)
      setExecutionTime(`${elapsed}s`)
      setExecutionStatus('Preview Refreshed')
      setRunning(false)
      return
    }

    // Both JavaScript & Python execute in terminal with stdin support
    setActiveTab('terminal')
    setTerminalOutput('$ Program Output\nExecuting code in terminal…\n')

    try {
      const activeStdin = overrideStdin !== undefined ? overrideStdin : stdinInput
      const currentCode = editorRef.current?.getValue() ?? activeFile.content
      setFiles(prev => prev.map(f => f.name === activeFile.name ? { ...f, content: currentCode } : f))
      const payloadFiles = files.map(f => ({ name: f.name, content: f.name === activeFile.name ? currentCode : f.content }))
      const res = await playgroundExecute({
        code: currentCode,
        language: currentLang,
        files: payloadFiles,
        stdin: activeStdin
      })

      const elapsed = res.time || ((performance.now() - t0) / 1000).toFixed(3) + 's'
      setExecutionTime(elapsed)
      setExecutionResult(res)

      if (res.waitingForInput) {
        setExecutionStatus('Waiting for Input')
        setTerminalOutput(`$ Program Output\n\n${cleanTerminalOutput(res.stdout)}`)
        setInteractiveInput('')
        return
      }

      setExecutionStatus(res.status || 'Finished')

      let out = '$ Program Output\n\n'
      const cleanStdout = cleanTerminalOutput(res.stdout)
      const cleanStderr = cleanTerminalOutput(res.stderr)
      const cleanCompile = cleanTerminalOutput(res.compileOutput)

      if (cleanCompile) {
        out += `[Compilation]\n${cleanCompile}\n\n`
      }
      if (cleanStdout) {
        out += cleanStdout
      }
      if (cleanStderr) {
        out += (cleanStdout ? '\n\n' : '') + `[Errors / Stderr]\n${cleanStderr}`
      }
      if (!cleanStdout && !cleanStderr && !cleanCompile) {
        out += 'Process finished with exit code ' + (res.exitCode ?? 0)
      } else if (res.exitCode === 0) {
        if (!out.includes('Process finished')) {
          out += '\n\nProcess finished successfully.'
        }
      } else {
        out += `\n\nProcess finished with exit code ${res.exitCode}.`
      }

      setTerminalOutput(out)
    } catch {
      setTerminalOutput('$ Program Output\n\nExecution failed. Server unreachable or timed out.')
      setExecutionStatus('Execution Error')
    } finally {
      setRunning(false)
    }
  }

  // Trigger AI Review
  function handleReviewAIClick() {
    if (!isAuthenticated) {
      setShowAuthModal(true)
    } else {
      navigate('/dashboard')
    }
  }

  // File management
  function handleAddFile(e: React.FormEvent) {
    e.preventDefault()
    if (!newFileName.trim()) return

    let name = newFileName.trim()
    let lang = 'plaintext'
    if (name.endsWith('.py')) lang = 'python'
    else if (name.endsWith('.js')) lang = 'javascript'
    else if (name.endsWith('.css')) lang = 'css'
    else if (name.endsWith('.html')) lang = 'html'

    const newFile: PlaygroundFile = {
      name,
      language: lang,
      content: name.endsWith('.py')
        ? `# ${name}\n`
        : `// ${name}\n`
    }

    setFiles(prev => [...prev, newFile])
    setActiveFileName(name)
    setNewFileName('')
    setShowNewFileModal(false)
  }

  function handleDeleteFile(nameToDelete: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (files.length <= 1) return
    setFiles(prev => prev.filter(f => f.name !== nameToDelete))
    if (activeFileName === nameToDelete) {
      const remaining = files.filter(f => f.name !== nameToDelete)
      setActiveFileName(remaining[0].name)
    }
  }

  return (
    <div className="playground-layout">
      {/* ── Guest Session Warning Banner ─────────────────────── */}
      <div className="pg-guest-banner" role="banner">
        <div className="pg-guest-tag">
          <ShieldAlert size={14} />
          <span>Guest Mode — Your workspace is temporary.</span>
        </div>
        <div className="pg-guest-cta">
          <Link to="/signup" className="btn btn-primary btn-sm" id="pg-create-account-save-btn">
            Create Account to Save <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* ── IDE Top Header Bar ────────────────────────────────── */}
      <header className="pg-topbar">
        <div className="pg-topbar-left">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Logo size="xs" />
          </Link>

          <div className="pg-lang-selector-container">
            <button
              className="pg-lang-btn"
              onClick={() => setShowLangPicker(!showLangPicker)}
              id="playground-lang-picker-btn"
            >
              {currentLang === 'html' && <Globe size={14} />}
              {currentLang === 'javascript' && <FileCode2 size={14} />}
              {currentLang === 'python' && <Terminal size={14} />}
              <span>{PLAYGROUND_LANGUAGES.find(l => l.id === currentLang)?.label}</span>
              <ChevronDown size={13} />
            </button>

            {showLangPicker && (
              <div className="pg-lang-dropdown">
                {PLAYGROUND_LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    className={`pg-lang-option ${currentLang === lang.id ? 'active' : ''}`}
                    onClick={() => handleSelectLanguage(lang.id)}
                    id={`lang-opt-${lang.id}`}
                  >
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`btn btn-primary btn-sm ${running ? 'btn-loading' : ''}`}
            onClick={() => handleRun()}
            disabled={running}
            id="playground-run-btn"
          >
            <Play size={13} fill="currentColor" /> Run Code
          </button>
        </div>

        <div className="pg-topbar-right">
          <button
            className="btn btn-secondary btn-sm pg-ai-btn"
            onClick={handleReviewAIClick}
            id="playground-review-ai-btn"
          >
            <Sparkles size={14} color="#FFFFFF" />
            <span>Review AI</span>
          </button>

          {!isAuthenticated ? (
            <Link to="/signin" className="btn btn-ghost btn-sm">
              Sign In
            </Link>
          ) : (
            <Link to="/dashboard" className="btn btn-ghost btn-sm">
              Dashboard
            </Link>
          )}
        </div>
      </header>

      {/* ── Main IDE 3-Pane Layout ─────────────────────────────── */}
      <div className={`pg-workspace ${isDraggingOutput || isDraggingExplorer ? 'is-resizing' : ''}`}>
        {/* Pane 1: File Explorer / Folder Structure */}
        <aside className="pg-file-explorer" style={{ width: `${fileWidth}px` }}>
          <div className="pg-explorer-header">
            <div className="pg-explorer-title">
              <FolderTree size={13} />
              <span>FILES & FOLDERS</span>
            </div>
            <button
              className="btn-icon btn-ghost pg-add-file-btn"
              onClick={() => setShowNewFileModal(true)}
              title="Add File"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="pg-file-list">
            {files.map(file => (
              <div
                key={file.name}
                className={`pg-file-item ${file.name === activeFileName ? 'active' : ''}`}
                onClick={() => setActiveFileName(file.name)}
                id={`file-item-${file.name}`}
              >
                <FileCode2 size={13} className="file-icon" />
                <span className="file-name">{file.name}</span>
                {files.length > 1 && (
                  <button
                    className="file-delete-btn"
                    onClick={(e) => handleDeleteFile(file.name, e)}
                    title="Delete file"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Resizer between Explorer & Editor */}
        <div
          className={`pg-resizer-col ${isDraggingExplorer ? 'dragging' : ''}`}
          onMouseDown={handleStartResizeExplorer}
          onDoubleClick={() => setFileWidth(220)}
          title="Drag to resize explorer (Double-click to reset)"
        />

        {/* Pane 2: Monaco Code Editor */}
        <main className="pg-editor-pane">
          <div className="pg-editor-tabs">
            {files.map(f => (
              <button
                key={f.name}
                className={`pg-tab-pill ${f.name === activeFileName ? 'active' : ''}`}
                onClick={() => setActiveFileName(f.name)}
              >
                <span>{f.name}</span>
              </button>
            ))}
          </div>

          <div className="pg-monaco-wrapper">
            <Editor
              key={activeFile.name}
              path={activeFile.name}
              height="100%"
              theme="vs-dark"
              language={activeFile.language}
              defaultValue={activeFile.content}
              onChange={handleEditorChange}
              onMount={(editor) => { editorRef.current = editor }}
              options={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13.5,
                lineHeight: 22,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'all',
                cursorBlinking: 'smooth',
                smoothScrolling: true
              }}
            />
          </div>
        </main>

        {/* Resizer between Editor & Output / Terminal (VS Code Style) */}
        <div
          className={`pg-resizer-col ${isDraggingOutput ? 'dragging' : ''}`}
          onMouseDown={handleStartResizeOutput}
          onDoubleClick={() => setOutputWidth(460)}
          title="Drag to expand output & terminal (Double-click to reset)"
        />

        {/* Pane 3: Output Panel (Preview for HTML & Terminal for JS/Python) */}
        <section className="pg-side-panel" style={{ width: `${outputWidth}px` }}>
          <div className="pg-side-tabs">
            {currentLang === 'html' ? (
              <button
                className={`pg-side-tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
                id="pg-tab-preview"
              >
                <Eye size={13} />
                <span>Live Preview</span>
              </button>
            ) : null}
            <button
              className={`pg-side-tab ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
              id="pg-tab-terminal"
            >
              <Terminal size={13} />
              <span>Terminal Output</span>
            </button>
            {currentLang !== 'html' && (
              <button
                className={`pg-side-tab ${showStdin ? 'active' : ''}`}
                onClick={() => setShowStdin(!showStdin)}
                title="Toggle standard input (stdin)"
              >
                <span>Stdin {stdinInput ? '●' : ''}</span>
              </button>
            )}
            {consoleLogs.length > 0 && (
              <button
                className={`pg-side-tab ${activeTab === 'console' ? 'active' : ''}`}
                onClick={() => setActiveTab('console')}
                id="pg-tab-console"
              >
                <FileCode2 size={13} />
                <span>Console ({consoleLogs.length})</span>
              </button>
            )}
          </div>

          <div className="pg-side-content">
            {activeTab === 'preview' && currentLang === 'html' && (
              <div className="pg-preview-frame-container" style={{ width: '100%', height: '100%', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: '#FFFFFF' }}>
                <iframe
                  title="HTML/CSS/JS Live Preview"
                  className="pg-preview-iframe"
                  srcDoc={livePreviewHtml}
                  sandbox="allow-scripts allow-modals allow-same-origin"
                  style={{ width: '100%', height: '100%', border: 'none', pointerEvents: isDraggingOutput ? 'none' : 'auto' }}
                />
              </div>
            )}

            {activeTab === 'terminal' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                {showStdin && (
                  <div style={{ padding: '8px 12px', background: '#141417', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>PROGRAM INPUT (STDIN) — passed to input() or process.stdin:</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => setStdinInput('')}>Clear</button>
                    </div>
                    <textarea
                      className="form-input"
                      rows={2}
                      style={{ width: '100%', fontFamily: 'var(--font-code)', fontSize: '12px', resize: 'vertical' }}
                      placeholder="Type input here (e.g. Alice)..."
                      value={stdinInput}
                      onChange={e => setStdinInput(e.target.value)}
                    />
                  </div>
                )}
                <div className="pg-output-terminal" style={{ flex: 1, overflowY: 'auto' }}>
                  <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{terminalOutput}</pre>

                  {executionResult?.waitingForInput && (
                    <div className="pg-waiting-input-card">
                      <div className="pg-waiting-input-label">
                        <span style={{ background: '#eab308', color: '#000', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                          ⌨️ INPUT NEEDED
                        </span>
                        <span>{executionResult.inputPrompt || 'Program is waiting for input:'}</span>
                      </div>
                      <div className="pg-waiting-input-row">
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
                </div>

                {!executionResult?.waitingForInput && (
                  <div className="pg-terminal-input-bar">
                    <span className="pg-terminal-prompt-prefix">&gt;</span>
                    <input
                      type="text"
                      className="pg-terminal-input-field"
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
              </div>
            )}

            {activeTab === 'console' && (
              <div className="pg-output-terminal" style={{ background: '#070B14' }}>
                {consoleLogs.length === 0 ? (
                  <div className="pg-output-empty">
                    Console ready. Logs from code execution or iframe will appear here.
                  </div>
                ) : (
                  consoleLogs.map((log, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: log.type === 'error' ? '#F87171' : log.type === 'warn' ? '#FBBF24' : '#FFFFFF' }}>
                      <span style={{ opacity: 0.6, marginRight: '8px' }}>&gt;</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Status Bar at Bottom ──────────────────────────────── */}
      <footer className="pg-statusbar">
        <div className="statusbar-left">
          <span className="status-tag"><CheckCircle2 size={12} /> {executionStatus}</span>
          <span className="status-divider">|</span>
          <span className="status-tag"><Clock size={12} /> Time: {executionTime}</span>
          <span className="status-divider">|</span>
          <span className="status-tag">Env: {currentLang.toUpperCase()}</span>
        </div>
        <div className="statusbar-right">
          <span className="status-guest-indicator">Guest Mode</span>
        </div>
      </footer>

      {/* ── AI Review Authentication Prompt Modal ──────────────── */}
      {showAuthModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowAuthModal(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)', color: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', margin: 0 }}>AI Code Review</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Automated code inspection</p>
                </div>
              </div>
              <button className="btn-icon btn-ghost" onClick={() => setShowAuthModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '8px 0 16px', color: 'var(--text-muted)', fontSize: '13.5px', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '14px' }}>
                AI Code Review is available after signing in. Create a free account to unlock:
              </p>
              <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-primary)' }}>
                <li>Detection of potential runtime bugs & edge cases</li>
                <li>Security vulnerability scans</li>
                <li>Performance optimizations</li>
                <li>Code quality suggestions with inline Monaco markers</li>
              </ul>
            </div>

            <div className="modal-footer" style={{ gap: '10px' }}>
              <Link to="/signin" className="btn btn-secondary">
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-primary" id="auth-modal-create-account-btn">
                Create Account <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Add File Modal ─────────────────────────────────────── */}
      {showNewFileModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowNewFileModal(false)}>
          <div className="modal" style={{ maxWidth: '380px' }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New File</h2>
              <button className="btn-icon btn-ghost" onClick={() => setShowNewFileModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddFile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">File Name (e.g. main.py, utils.js, style.css)</label>
                <input
                  className="form-input"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  placeholder="e.g. utils.js"
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewFileModal(false)}>
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
