import React, { useState, FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import './Settings.css'

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const [tab, setTab] = useState<'general' | 'security' | 'preferences'>('general')

  // General
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [saving, setSaving] = useState(false)
  const [generalMsg, setGeneralMsg] = useState('')
  const [generalErr, setGeneralErr] = useState('')

  // Security
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [savingPass, setSavingPass] = useState(false)
  const [passMsg, setPassMsg] = useState('')
  const [passErr, setPassErr] = useState('')

  // Preferences
  const [reducedMotion, setReducedMotion] = useState(false)
  const [reviewNotifs, setReviewNotifs] = useState(true)

  async function saveGeneral(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setGeneralMsg('')
    setGeneralErr('')
    try {
      await api.patch('/users/profile', { name, username })
      await refreshUser()
      setGeneralMsg('Settings saved.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setGeneralErr(e.response?.data?.error || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPassMsg('')
    setPassErr('')

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPassErr('New passwords do not match.')
      return
    }

    setSavingPass(true)
    try {
      await api.post('/users/change-password', passwords)
      setPassMsg('Password changed successfully.')
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setPassErr(e.response?.data?.error || 'Failed to change password.')
    } finally {
      setSavingPass(false)
    }
  }

  return (
    <AppShell>
      <div className="settings-page">
        <header className="settings-header">
          <p className="dash-breadcrumb">Workspace / Settings</p>
          <h1>Settings</h1>
        </header>

        <div className="settings-tabs">
          {(['general', 'security', 'preferences'] as const).map(t => (
            <button key={t} className={`dash-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === 'general' && (
            <section className="settings-section">
              <h2>General</h2>
              <p>Manage your account details.</p>
              <form onSubmit={saveGeneral} className="settings-form">
                {generalMsg && <div className="auth-success">{generalMsg}</div>}
                {generalErr && <div className="auth-error">{generalErr}</div>}
                <div className="form-group">
                  <label className="form-label" htmlFor="set-name">Full name</label>
                  <input id="set-name" className="form-input" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="set-user">Username</label>
                  <input id="set-user" className="form-input" value={username} onChange={e => setUsername(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={user?.email} readOnly disabled />
                </div>
                <button type="submit" className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} disabled={saving}>
                  {!saving && 'Save changes'}
                </button>
              </form>
            </section>
          )}

          {tab === 'security' && (
            <section className="settings-section">
              <h2>Security</h2>
              <p>Change your password and manage account security.</p>
              <form onSubmit={changePassword} className="settings-form">
                {passMsg && <div className="auth-success">{passMsg}</div>}
                {passErr && <div className="auth-error">{passErr}</div>}
                <div className="form-group">
                  <label className="form-label" htmlFor="cur-pass">Current password</label>
                  <input
                    id="cur-pass"
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    value={passwords.currentPassword}
                    onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-pass">New password</label>
                  <input
                    id="new-pass"
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    value={passwords.newPassword}
                    onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="conf-pass">Confirm new password</label>
                  <input
                    id="conf-pass"
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    value={passwords.confirmPassword}
                    onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))}
                    required
                  />
                </div>
                <button type="submit" className={`btn btn-primary ${savingPass ? 'btn-loading' : ''}`} disabled={savingPass}>
                  {!savingPass && 'Change password'}
                </button>
              </form>
            </section>
          )}

          {tab === 'preferences' && (
            <section className="settings-section">
              <h2>Preferences</h2>
              <p>Customize your workspace experience.</p>
              <div className="pref-list">
                <div className="pref-item">
                  <div className="pref-info">
                    <b>Review notifications</b>
                    <span>Receive a notification when a review needs your attention.</span>
                  </div>
                  <button
                    className={`toggle-btn ${reviewNotifs ? 'on' : ''}`}
                    onClick={() => setReviewNotifs(!reviewNotifs)}
                    aria-label="Toggle review notifications"
                  >
                    <span />
                  </button>
                </div>
                <div className="pref-item">
                  <div className="pref-info">
                    <b>Reduced motion</b>
                    <span>Minimize non-essential animations in the interface.</span>
                  </div>
                  <button
                    className={`toggle-btn ${reducedMotion ? 'on' : ''}`}
                    onClick={() => setReducedMotion(!reducedMotion)}
                    aria-label="Toggle reduced motion"
                  >
                    <span />
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  )
}
