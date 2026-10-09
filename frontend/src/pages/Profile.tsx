import React, { useState, FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import './Settings.css'

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await api.patch('/users/profile', { name, username })
      await refreshUser()
      setMessage('Profile updated successfully.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <div className="settings-page">
        <header className="settings-header">
          <p className="dash-breadcrumb">Workspace / Profile</p>
          <h1>Profile</h1>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h2>Personal Information</h2>
            <p>Update how your profile appears to collaborators.</p>

            <form onSubmit={handleSave} className="settings-form">
              {message && <div className="auth-success">{message}</div>}
              {error && <div className="auth-error">{error}</div>}

              <div className="settings-avatar-row">
                <div className="avatar avatar-xl">{user?.avatarInitials}</div>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Your avatar is generated from your initials.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="prof-name">Full Name</label>
                <input
                  id="prof-name"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="prof-user">Username</label>
                <input
                  id="prof-user"
                  className="form-input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" value={user?.email} readOnly disabled />
                <span className="form-hint">Email cannot be changed at this time.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Member since</label>
                <input className="form-input" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''} readOnly disabled />
              </div>

              <button type="submit" className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} disabled={saving}>
                {!saving && 'Save changes'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
