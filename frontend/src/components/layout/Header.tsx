import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Logo } from '../ui/Logo'
import { useAuth } from '../../contexts/AuthContext'
import './Header.css'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  return (
    <header className="glass-header" aria-label="Main Navigation">
      <div className="header-inner">
        <Link to="/" className="header-brand" onClick={() => setMobileOpen(false)}>
          <Logo size="md" />
        </Link>

        <nav className={`header-nav ${mobileOpen ? 'nav-open' : ''}`}>
          <a href="/#features" className="nav-link" onClick={() => setMobileOpen(false)}>
            Features
          </a>
          <a href="/#collaboration" className="nav-link" onClick={() => setMobileOpen(false)}>
            Collaboration
          </a>
          <a href="/#ai-review" className="nav-link" onClick={() => setMobileOpen(false)}>
            AI Review
          </a>
          <a href="/#how-it-works" className="nav-link" onClick={() => setMobileOpen(false)}>
            How It Works
          </a>
        </nav>

        <div className="header-actions">
          {isAuthenticated ? (
            <>
              <Link to="/playground" className="btn btn-ghost btn-sm">
                Playground
              </Link>
              <Link to="/dashboard" className="btn btn-primary btn-sm">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/playground"
                className="btn btn-ghost btn-sm"
              >
                Playground
              </Link>
              <Link to="/signin" className="btn btn-ghost btn-sm nav-signin">
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm" id="header-signup-btn">
                Sign Up
              </Link>
            </>
          )}

          <button
            className="mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
