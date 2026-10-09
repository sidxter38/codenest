import React, { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Folder, MessageSquareText, Activity, Settings,
  Bell, ChevronDown, LogOut, User, X, Menu, Search, Share2, Code2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../ui/Logo'
import './AppShell.css'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const initials = user?.avatarInitials || user?.name?.slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="shell">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="shell-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`shell-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="shell-sidebar-top">
          <Link to="/dashboard" style={{ textDecoration: 'none' }}><Logo size="sm" /></Link>
          <button className="btn btn-ghost btn-icon shell-close-btn" onClick={() => setSidebarOpen(false)}>
            <X size={17} />
          </button>
        </div>

        <Link to="/profile" className="shell-user-pill" style={{ textDecoration: 'none' }} title="View Profile">
          <div className="avatar avatar-md">{initials}</div>
          <div className="shell-user-info">
            <span className="shell-user-name">{user?.name || user?.username}</span>
            <span className="shell-user-sub">@{user?.username}</span>
          </div>
        </Link>

        <nav className="shell-nav">
          <button
            className="shell-nav-item cmd-quick-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('codenest:open-palette'))}
            style={{ width: '100%', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '8px', cursor: 'pointer' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={16} color="#FFFFFF" /> Commands
            </span>
            <kbd style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#FFFFFF' }}>⌘K</kbd>
          </button>
          <NavLink to="/dashboard" className={({ isActive }) => `shell-nav-item ${isActive && !window.location.search ? 'active' : ''}`}>
            <LayoutDashboard size={17} /> Overview
          </NavLink>
          <NavLink to="/dashboard?tab=workspaces" className="shell-nav-item">
            <Share2 size={17} /> Live Workspaces
          </NavLink>
          <NavLink to="/dashboard?tab=projects" className="shell-nav-item">
            <Folder size={17} /> Projects
          </NavLink>
          <NavLink to="/dashboard?tab=reviews" className="shell-nav-item">
            <MessageSquareText size={17} /> Reviews
          </NavLink>
          <NavLink to="/playground" className="shell-nav-item">
            <Code2 size={17} /> Playground
          </NavLink>
          <NavLink to="/dashboard?tab=activity" className="shell-nav-item">
            <Activity size={17} /> Activity
          </NavLink>
        </nav>

        <div className="shell-sidebar-bottom">
          <NavLink to="/profile" className={({ isActive }) => `shell-nav-item ${isActive ? 'active' : ''}`}>
            <User size={17} /> Profile
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `shell-nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={17} /> Settings
          </NavLink>

          <div className="shell-user-menu-wrapper">
            <button
              className="shell-user-menu-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title="Account Menu"
            >
              <div className="avatar avatar-sm">{initials}</div>
              <div className="shell-user-info-sm">
                <span>{user?.name || user?.username}</span>
                <small>@{user?.username}</small>
              </div>
              <ChevronDown size={14} className={userMenuOpen ? 'rotated' : ''} />
            </button>

            {userMenuOpen && (
              <div className="shell-dropdown">
                <Link to="/profile" className="shell-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                  <User size={15} /> Profile
                </Link>
                <Link to="/settings" className="shell-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                  <Settings size={15} /> Settings
                </Link>
                <div className="shell-dropdown-divider" />
                <button className="shell-dropdown-item danger" onClick={handleSignOut}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="shell-main">
        {/* Top mobile bar */}
        <div className="shell-mobile-bar">
          <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}><Logo size="xs" /></Link>
          <Link to="/dashboard" className="btn btn-ghost btn-icon">
            <Bell size={18} />
          </Link>
        </div>

        <div className="shell-content">
          {children}
        </div>
      </div>
    </div>
  )
}
