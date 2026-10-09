import React, { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Code2, FileCode2, MessageSquareText, ArrowRight,
  Folder, Bell, Clock, Users, Activity, X, Copy, Check, Share2,
  Terminal, Sparkles, ExternalLink
} from 'lucide-react'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../contexts/AuthContext'
import {
  getProjects, createProject,
  Project
} from '../services/projects'
import {
  getUserWorkspaces, WorkspaceData
} from '../services/workspaces'
import { CollabModal } from '../components/CollabModal'
import api from '../services/api'
import './Dashboard.css'

const LANGUAGES = ['HTML/CSS/JS', 'JavaScript', 'Python']

function timeAgo(date: string) {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'approved': return 'badge-green'
    case 'requested': case 'in_review': return 'badge-purple'
    case 'changes_requested': return 'badge-yellow'
    case 'draft': return 'badge-muted'
    default: return 'badge-muted'
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Draft', requested: 'Requested', in_review: 'In Review',
    changes_requested: 'Changes Requested', approved: 'Approved', resolved: 'Resolved'
  }
  return map[status] || status
}

// ─── Modal: Create Project ───────────────────────────────────────────────────

interface CreateProjectModalProps {
  onClose: () => void
  onCreated: (project: Project) => void
  onStartCollab: (project: Project) => void
}

function CreateProjectModal({ onClose, onCreated, onStartCollab }: CreateProjectModalProps) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', description: '', language: 'HTML/CSS/JS' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdProject, setCreatedProject] = useState<Project | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const project = await createProject(form)
      setCreatedProject(project)
      onCreated(project)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h2>{createdProject ? 'Project Created!' : 'Create a project'}</h2>
            <p>{createdProject ? 'Your project is ready to go.' : 'Set up a shared space for your team.'}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {!createdProject ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="proj-name">Project name <span>*</span></label>
              <input
                id="proj-name"
                className="form-input"
                placeholder="e.g. compiler-service"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="proj-desc">Description <span>optional</span></label>
              <textarea
                id="proj-desc"
                className="form-textarea"
                placeholder="What is this project for?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="proj-lang">Primary language</label>
              <select
                id="proj-lang"
                className="form-select"
                value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
              >
                {LANGUAGES.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn-primary ${loading ? 'btn-loading' : ''}`} disabled={loading}>
                {!loading && <>Create project <ArrowRight size={15} /></>}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
            <div style={{
              textAlign: 'center',
              padding: '24px 16px',
              background: 'linear-gradient(180deg, rgba(24, 24, 28, 0.7) 0%, rgba(14, 14, 18, 0.95) 100%)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.12)'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Check size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: '#EAFBFF' }}>
                {createdProject.name}
              </h3>
              <p style={{ fontSize: '13px', color: 'rgba(234, 251, 255, 0.7)', margin: 0 }}>
                {createdProject.language} · Ready for development
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  onClose()
                  navigate(`/projects/${createdProject.id}`)
                }}
              >
                Open Project <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  onClose()
                  onStartCollab(createdProject)
                }}
              >
                <Users size={15} /> Start Collab
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabModalTab, setCollabModalTab] = useState<'create' | 'join'>('create')
  const [collabProject, setCollabProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<'overview' | 'projects' | 'workspaces' | 'reviews' | 'activity'>('overview')

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [projs, wsList, notifs, acts] = await Promise.all([
        getProjects(),
        getUserWorkspaces().catch(() => []),
        api.get('/notifications').then(r => r.data.notifications).catch(() => []),
        api.get('/notifications/activity').then(r => r.data.activities).catch(() => [])
      ])
      setProjects(projs)
      setWorkspaces(wsList)
      setNotifications(notifs)
      setActivity(acts)

      // Collect all reviews from projects
      const allReviews: any[] = []
      projs.forEach((p: Project) => {
        if (p.reviews) allReviews.push(...p.reviews.map((r: any) => ({ ...r, projectName: p.name, projectId: p.id })))
      })
      setReviews(allReviews.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
    } catch (e) {
      console.error('Failed to load dashboard', e)
    } finally {
      setLoading(false)
    }
  }

  function handleProjectCreated(project: Project) {
    setProjects(prev => [project, ...prev])
  }

  function handleStartCollab(project: Project) {
    setCollabProject(project)
    setShowCollabModal(true)
  }

  function handleWorkspaceCreated(ws: WorkspaceData) {
    setWorkspaces(prev => [ws, ...prev])
  }

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const filteredWorkspaces = workspaces.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.code.toLowerCase().includes(search.toLowerCase()))

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const unread = notifications.filter(n => !n.read).length
  const pendingReviews = reviews.filter(r => ['requested', 'in_review'].includes(r.status)).length

  if (loading) {
    return (
      <AppShell>
        <div className="dash-loading">
          <div className="spinner" />
          <span>Loading your Code<span className="codenest-animated-nest">Nest</span> workspace...</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="dashboard">
        {/* Header */}
        <header className="dash-header">
          <div>
            <p className="dash-breadcrumb">Workspace / Overview</p>
            <h1 className="dash-title">{greeting()}, {user?.name?.split(' ')[0] || user?.username}.</h1>
          </div>
          <div className="dash-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCollabProject(null)
                setCollabModalTab('join')
                setShowCollabModal(true)
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              id="dash-join-room-btn"
            >
              <Users size={14} /> Join Room
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Project
            </button>
          </div>
        </header>

        {/* Stats row */}
        <div className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat-value">{projects.length}</span>
            <span className="dash-stat-label">Projects</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">{workspaces.length}</span>
            <span className="dash-stat-label">Live Workspaces</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">{pendingReviews}</span>
            <span className="dash-stat-label">Pending Reviews</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">{reviews.length}</span>
            <span className="dash-stat-label">Total Reviews</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="dash-tabs">
          {(['overview', 'projects', 'workspaces', 'reviews', 'activity'] as const).map(t => (
            <button key={t} className={`dash-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'workspaces' ? 'Live Workspaces' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="dash-body">
          {/* Overview */}
          {tab === 'overview' && (
            <div className="dash-overview">
              {/* Collaborative Workspaces Banner */}
              {workspaces.length > 0 && (
                <section className="dash-section" style={{ marginBottom: '24px' }}>
                  <div className="dash-section-head">
                    <div>
                      <h2>Live Collaborative Sessions</h2>
                      <p>Active rooms with real-time cursor sync & multi-user editing.</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab('workspaces')}>
                      View all ({workspaces.length}) <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="project-grid">
                    {workspaces.slice(0, 3).map(ws => (
                      <WorkspaceCard key={ws.id} workspace={ws} />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent projects */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div>
                    <h2>Projects</h2>
                    <p>Pick up where you left off.</p>
                  </div>
                  <div className="dash-search">
                    <Search size={15} />
                    <input
                      type="search"
                      placeholder="Search projects..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon"><Folder size={22} /></div>
                    <h3>{search ? 'No matching projects' : 'No projects yet'}</h3>
                    <p>{search ? 'Try a different search term.' : 'Create your first project to get started.'}</p>
                    {!search && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                          <Plus size={14} /> Create project
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="project-grid">
                    {filteredProjects.slice(0, 6).map(p => (
                      <ProjectCard key={p.id} project={p} onCollab={handleStartCollab} />
                    ))}
                  </div>
                )}
              </section>

              <div className="dash-cols">
                {/* Recent reviews */}
                <section className="dash-reviews">
                  <div className="dash-section-head">
                    <div>
                      <h2>Reviews</h2>
                      <p>Changes needing your input.</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab('reviews')}>
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {reviews.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px' }}>
                      <h3>No reviews yet</h3>
                      <p>Reviews will appear here when requested.</p>
                    </div>
                  ) : (
                    reviews.slice(0, 5).map(r => (
                      <Link key={r.id} to={`/projects/${r.projectId}/review/${r.id}`} className="review-row">
                        <div className="avatar avatar-sm">{r.creator?.avatarInitials || '??'}</div>
                        <div className="review-row-copy">
                          <b>{r.title}</b>
                          <span>{r.projectName} · {timeAgo(r.updatedAt)}</span>
                        </div>
                        <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                        <span className="review-comment-count">
                          <MessageSquareText size={13} /> {r._count?.comments || 0}
                        </span>
                      </Link>
                    ))
                  )}
                </section>

                {/* Activity */}
                <section className="dash-activity">
                  <div className="dash-section-head">
                    <div><h2>Activity</h2><p>In your workspace</p></div>
                  </div>
                  {activity.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px' }}>
                      <h3>No activity yet</h3>
                    </div>
                  ) : (
                    activity.slice(0, 8).map((a: any) => (
                      <div key={a.id} className="activity-item">
                        <div className="avatar avatar-sm">{a.user?.avatarInitials || '??'}</div>
                        <div className="activity-copy">
                          <p><b>{a.user?.name}</b> {a.summary}</p>
                          {a.project && <span className="activity-proj">{a.project.name}</span>}
                        </div>
                        <span className="activity-time">{timeAgo(a.createdAt)}</span>
                      </div>
                    ))
                  )}
                </section>
              </div>
            </div>
          )}

          {/* Projects tab */}
          {tab === 'projects' && (
            <div className="dash-section">
              <div className="dash-section-head">
                <div><h2>All Projects</h2><p>{projects.length} projects</p></div>
                <div className="dash-search">
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Search projects..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
              {filteredProjects.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><Folder size={22} /></div>
                  <h3>No projects found</h3>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                    <Plus size={14} /> Create project
                  </button>
                </div>
              ) : (
                <div className="project-grid">
                  {filteredProjects.map(p => (
                    <ProjectCard key={p.id} project={p} onCollab={handleStartCollab} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workspaces tab */}
          {tab === 'workspaces' && (
            <div className="dash-section">
              <div className="dash-section-head">
                <div>
                  <h2>Live Collaborative Workspaces</h2>
                  <p>{workspaces.length} active sessions with 4-digit code sharing</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setCollabProject(null); setCollabModalTab('join'); setShowCollabModal(true); }}>
                    <Users size={14} /> Join Room
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => { setCollabProject(null); setCollabModalTab('create'); setShowCollabModal(true); }}>
                    <Plus size={14} /> Create Room
                  </button>
                </div>
              </div>
              {filteredWorkspaces.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><Share2 size={22} /></div>
                  <h3>No collaborative workspaces yet</h3>
                  <p>Create a live room or enter a teammate's 4-digit code.</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setCollabProject(null); setCollabModalTab('create'); setShowCollabModal(true); }}>
                      <Plus size={14} /> Create Room
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setCollabProject(null); setCollabModalTab('join'); setShowCollabModal(true); }}>
                      <Users size={14} /> Join Room
                    </button>
                  </div>
                </div>
              ) : (
                <div className="project-grid">
                  {filteredWorkspaces.map(ws => <WorkspaceCard key={ws.id} workspace={ws} />)}
                </div>
              )}
            </div>
          )}

          {/* Reviews tab */}
          {tab === 'reviews' && (
            <div className="dash-section">
              <div className="dash-section-head">
                <div><h2>All Reviews</h2><p>{reviews.length} reviews across your projects</p></div>
              </div>
              {reviews.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><MessageSquareText size={22} /></div>
                  <h3>No reviews yet</h3>
                  <p>Open a project and create a review to get started.</p>
                </div>
              ) : (
                <div className="reviews-list">
                  {reviews.map(r => (
                    <Link key={r.id} to={`/projects/${r.projectId}/review/${r.id}`} className="review-row review-row-full">
                      <div className="avatar avatar-sm">{r.creator?.avatarInitials || '??'}</div>
                      <div className="review-row-copy">
                        <b>{r.title}</b>
                        <span>{r.projectName} · {timeAgo(r.updatedAt)}</span>
                      </div>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                      <span className="review-comment-count">
                        <MessageSquareText size={13} /> {r._count?.comments || 0}
                      </span>
                      <ArrowRight size={15} className="review-row-arrow" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <div className="dash-section">
              <div className="dash-section-head">
                <div><h2>Activity</h2><p>Recent events in your workspace</p></div>
              </div>
              {activity.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><Activity size={22} /></div>
                  <h3>No activity yet</h3>
                </div>
              ) : (
                <div className="activity-list">
                  {activity.map((a: any) => (
                    <div key={a.id} className="activity-item activity-item-full">
                      <div className="avatar avatar-md">{a.user?.avatarInitials || '??'}</div>
                      <div className="activity-copy">
                        <p><b>{a.user?.name}</b> {a.summary}</p>
                        {a.project && <span className="activity-proj">{a.project.name}</span>}
                        <span className="activity-time">{timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={handleProjectCreated}
          onStartCollab={handleStartCollab}
        />
      )}

      {showCollabModal && (
        <CollabModal
          project={collabProject}
          initialTab={collabModalTab}
          onClose={() => {
            setShowCollabModal(false)
            setCollabProject(null)
            setCollabModalTab('create')
          }}
          onCreated={handleWorkspaceCreated}
        />
      )}
    </AppShell>
  )
}

function ProjectCard({ project, onCollab }: { project: Project; onCollab: (p: Project) => void }) {
  const reviews = project.reviews || []
  const pendingReviews = reviews.filter(r => ['requested', 'in_review'].includes(r.status))

  return (
    <Link to={`/projects/${project.id}`} className="proj-card">
      <div className="proj-card-top">
        <span className="proj-icon"><Code2 size={18} /></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendingReviews.length > 0 && <span className="badge badge-purple">{pendingReviews.length} in review</span>}
          <button
            type="button"
            className="proj-collab-btn"
            title="Start or Join Collab Room"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onCollab(project)
            }}
          >
            <Users size={12} /> Collab
          </button>
        </div>
      </div>
      <h3 className="proj-name">{project.name}</h3>
      <p className="proj-desc">{project.description || 'No description provided.'}</p>
      <div className="proj-meta">
        <span><FileCode2 size={13} /> {project.language}</span>
        <span><Clock size={13} /> {new Date(project.updatedAt).toLocaleDateString()}</span>
      </div>
      <div className="proj-footer">
        <div className="avatar-stack">
          {(project.members || []).slice(0, 4).map(m => (
            <div key={m.id} className="avatar avatar-sm" title={m.user.name}>{m.user.avatarInitials}</div>
          ))}
          {(project.members || []).length > 4 && (
            <div className="avatar avatar-sm">+{(project.members || []).length - 4}</div>
          )}
        </div>
        <ArrowRight size={16} className="proj-arrow" />
      </div>
    </Link>
  )
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceData }) {
  return (
    <Link to={`/workspace/${workspace.code}`} className="proj-card" style={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}>
      <div className="proj-card-top">
        <span className="proj-icon" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#FFFFFF' }}>
          <Share2 size={18} />
        </span>
        <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.15)', fontFamily: 'monospace', letterSpacing: '1px', fontWeight: 700 }}>
          {workspace.code}
        </span>
      </div>
      <h3 className="proj-name">{workspace.name}</h3>
      <p className="proj-desc">
        {workspace.description || `Collaborative ${workspace.language.toUpperCase()} session with 4-digit code ${workspace.numericCode}.`}
      </p>
      <div className="proj-meta">
        <span><Terminal size={13} /> {workspace.language}</span>
        <span><Users size={13} /> {(workspace.members || []).length} joined</span>
      </div>
      <div className="proj-footer">
        <div className="avatar-stack">
          {(workspace.members || []).slice(0, 4).map(m => (
            <div key={m.id} className="avatar avatar-sm" title={m.user.name}>{m.user.avatarInitials || m.user.name.slice(0, 2).toUpperCase()}</div>
          ))}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#FFFFFF', fontWeight: 600 }}>
          Join <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  )
}
