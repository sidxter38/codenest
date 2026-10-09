import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Terminal, Plus, Folder, Share2, Users, Play, Sparkles,
  Settings, LogOut, ArrowRight, LayoutDashboard, Code2, Save, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import './CommandPalette.css'

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  category: 'Navigation' | 'Actions' | 'Collaboration' | 'System'
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onAction?: (actionId: string) => void
}

export function CommandPalette({ isOpen, onClose, onAction }: CommandPaletteProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const commands: CommandItem[] = [
    {
      id: 'go-dashboard',
      title: 'Go to Dashboard',
      subtitle: 'Overview, recent projects & activity',
      icon: <LayoutDashboard size={16} />,
      category: 'Navigation',
      shortcut: 'G D',
      action: () => { navigate('/dashboard'); onClose() }
    },
    {
      id: 'go-playground',
      title: 'Open Code Playground',
      subtitle: 'Instant sandboxed editor for HTML, JS, and Python',
      icon: <Code2 size={16} />,
      category: 'Navigation',
      shortcut: 'G P',
      action: () => { navigate('/playground'); onClose() }
    },
    {
      id: 'go-workspaces',
      title: 'View Collaborative Workspaces',
      subtitle: 'Live rooms with real-time cursor sync',
      icon: <Users size={16} />,
      category: 'Navigation',
      action: () => { navigate('/dashboard?tab=workspaces'); onClose() }
    },
    {
      id: 'go-projects',
      title: 'View All Projects',
      subtitle: 'Browse your repository files & git commits',
      icon: <Folder size={16} />,
      category: 'Navigation',
      action: () => { navigate('/dashboard?tab=projects'); onClose() }
    },
    {
      id: 'action-run',
      title: 'Run Current Code',
      subtitle: 'Execute isolated in Docker sandbox',
      icon: <Play size={16} />,
      category: 'Actions',
      shortcut: 'Ctrl+Enter',
      action: () => {
        if (onAction) onAction('run')
        window.dispatchEvent(new CustomEvent('codenest:run'))
        onClose()
      }
    },
    {
      id: 'action-save',
      title: 'Save Current File',
      subtitle: 'Persist changes to cloud storage',
      icon: <Save size={16} />,
      category: 'Actions',
      shortcut: 'Ctrl+S',
      action: () => {
        if (onAction) onAction('save')
        window.dispatchEvent(new CustomEvent('codenest:save'))
        onClose()
      }
    },
    {
      id: 'action-ai-review',
      title: 'Run AI Code Review',
      subtitle: 'Inspect bugs, security risks, & performance issues',
      icon: <Sparkles size={16} />,
      category: 'Actions',
      action: () => {
        if (onAction) onAction('ai-review')
        window.dispatchEvent(new CustomEvent('codenest:ai-review'))
        onClose()
      }
    },
    {
      id: 'collab-new',
      title: 'Create Collaborative Workspace',
      subtitle: 'Generate a 4-digit code (e.g. WS-4827) for pair programming',
      icon: <Share2 size={16} />,
      category: 'Collaboration',
      action: () => {
        navigate('/dashboard')
        window.dispatchEvent(new CustomEvent('codenest:modal-collaborate'))
        onClose()
      }
    },
    {
      id: 'collab-join',
      title: 'Join Workspace by Code',
      subtitle: 'Enter a 4-digit room code from a teammate',
      icon: <Users size={16} />,
      category: 'Collaboration',
      action: () => {
        navigate('/dashboard')
        window.dispatchEvent(new CustomEvent('codenest:modal-join'))
        onClose()
      }
    },
    {
      id: 'system-settings',
      title: 'User Settings',
      subtitle: 'Profile, preferences & notifications',
      icon: <Settings size={16} />,
      category: 'System',
      action: () => { navigate('/settings'); onClose() }
    },
    {
      id: 'system-signout',
      title: 'Sign Out',
      subtitle: `Signed in as ${user?.email || 'user'}`,
      icon: <LogOut size={16} />,
      category: 'System',
      action: async () => {
        await signOut()
        navigate('/')
        onClose()
      }
    }
  ]

  const filtered = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    (cmd.subtitle && cmd.subtitle.toLowerCase().includes(query.toLowerCase())) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, selectedIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  // Group filtered commands
  const categories = Array.from(new Set(filtered.map(c => c.category)))

  return (
    <div className="cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd-modal" onMouseDown={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-header">
          <Search size={18} className="cmd-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Type a command or search actions..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
          />
          <button className="cmd-close-btn" onClick={onClose} aria-label="Close Command Palette">
            <kbd>ESC</kbd>
          </button>
        </div>

        <div className="cmd-body" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmd-empty">
              <Terminal size={24} />
              <p>No matching commands found</p>
              <span>Try typing "workspace", "run", "dashboard", or "review"</span>
            </div>
          ) : (
            categories.map(category => {
              const items = filtered.filter(c => c.category === category)
              return (
                <div key={category} className="cmd-group">
                  <div className="cmd-group-title">{category}</div>
                  {items.map(item => {
                    const itemGlobalIndex = filtered.indexOf(item)
                    const isSelected = itemGlobalIndex === selectedIndex
                    return (
                      <div
                        key={item.id}
                        className={`cmd-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(itemGlobalIndex)}
                      >
                        <div className="cmd-item-icon">{item.icon}</div>
                        <div className="cmd-item-content">
                          <span className="cmd-item-title">{item.title}</span>
                          {item.subtitle && <span className="cmd-item-sub">{item.subtitle}</span>}
                        </div>
                        {item.shortcut && (
                          <div className="cmd-item-shortcut">
                            <kbd>{item.shortcut}</kbd>
                          </div>
                        )}
                        <ArrowRight size={14} className="cmd-item-arrow" />
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="cmd-footer">
          <div className="cmd-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>esc</kbd> close</span>
          </div>
          <div className="cmd-brand">
            <span>Code<span className="codenest-animated-nest">Nest</span> <b>v1.0</b></span>
          </div>
        </div>
      </div>
    </div>
  )
}
