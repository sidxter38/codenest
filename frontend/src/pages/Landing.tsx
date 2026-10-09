import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Code2, Users, Terminal, Sparkles, ShieldCheck,
  Play, Globe, Layers, ChevronRight
} from 'lucide-react'
import { Header } from '../components/layout/Header'
import { Logo } from '../components/ui/Logo'
import './Landing.css'

const STEPS = [
  { num: '01', title: 'Create Project', desc: 'Pick a language and start coding' },
  { num: '02', title: 'Write Code', desc: 'Monaco editor with full IDE features' },
  { num: '03', title: 'Run / Preview', desc: 'Instant preview or sandboxed execution' },
  { num: '04', title: 'Collaborate', desc: 'Invite teammates to edit in real time' },
  { num: '05', title: 'AI Review', desc: 'Get actionable quality insights' },
  { num: '06', title: 'Improve Code', desc: 'Apply suggestions and ship better code' }
]

const LANGUAGES = [
  { name: 'HTML', icon: <Globe size={16} /> },
  { name: 'CSS', icon: <Code2 size={16} /> },
  { name: 'JavaScript', icon: <Terminal size={16} /> },
  { name: 'Python', icon: <Layers size={16} /> }
]

export default function Landing() {
  return (
    <div className="landing-page">
      <Header />

      <main className="landing-main">
        {/* ── Hero Section ────────────────────────────────────── */}
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              Where code<br />
              <span className="gradient-text">comes together.</span>
            </h1>

            <p className="hero-subtitle">
              Code, collaborate, preview, and review your projects in one
              developer-focused workspace with AI-assisted quality checks.
            </p>

            <div className="hero-actions">
              <Link to="/signup" className="btn btn-primary btn-lg" id="hero-get-started-btn">
                Get Started <ArrowRight size={16} />
              </Link>
              <Link to="/playground" className="btn btn-secondary btn-lg" id="hero-try-playground-btn">
                <Play size={15} /> Try Playground
              </Link>
            </div>

            <p className="hero-note">No account required for Playground.</p>
          </div>

          {/* ── IDE Preview Mockup ──────────────────────────────── */}
          <div className="hero-preview-wrapper">
            <div className="ide-preview-card">
              <div className="ide-header-bar">
                <div className="ide-traffic-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <div className="ide-active-tab">
                  <Code2 size={12} />
                  <span>main.py</span>
                </div>
                <div className="ide-collab-presence">
                  <div className="avatar-stack">
                    <div className="avatar avatar-sm" style={{ background: '#FFFFFF', color: '#09090B', fontWeight: 700 }}>TA</div>
                    <div className="avatar avatar-sm" style={{ background: '#4ADE80', color: '#070B14' }}>RA</div>
                    <div className="avatar avatar-sm" style={{ background: '#FBBF24', color: '#070B14' }}>AM</div>
                  </div>
                  <span className="presence-label">3 online</span>
                </div>
              </div>

              <div className="ide-body-mock">
                <div className="ide-line-numbers">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
                </div>
                <div className="ide-code-lines">
                  <div className="code-line">
                    <span className="kw">def</span> <span className="fn">aggregate_metrics</span>(stream_data):
                  </div>
                  <div className="code-line">
                    &nbsp;&nbsp;&nbsp;&nbsp;results = {'{}'}
                  </div>
                  <div className="code-line cursor-line">
                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="kw">for</span> item <span className="kw">in</span> stream_data:
                    <div className="remote-cursor-indicator" style={{ borderLeftColor: '#FFFFFF' }}>
                      <span className="cursor-tag" style={{ background: '#FFFFFF', color: '#09090B' }}>Tabish</span>
                    </div>
                  </div>
                  <div className="code-line">
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;val = item.get(<span className="str">'score'</span>, <span className="num">0</span>)
                  </div>
                  <div className="code-line cursor-line">
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;results[item[<span className="str">'id'</span>]] = val * <span className="num">1.42</span>
                    <div className="remote-cursor-indicator" style={{ borderLeftColor: '#4ADE80' }}>
                      <span className="cursor-tag" style={{ background: '#4ADE80', color: '#070B14' }}>Rahul</span>
                    </div>
                  </div>
                  <div className="code-line">
                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="kw">return</span> results
                  </div>
                  <div className="code-line">&nbsp;</div>
                  <div className="code-line comment">
                    # [AI Review] Guard against KeyError on 'id'
                  </div>
                </div>
              </div>

              <div className="ide-footer-status">
                <div className="status-item">Python 3.11</div>
                <div className="status-item">Sandboxed</div>
                <div className="status-item"><Sparkles size={11} /> AI Ready</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature 1: Code Studio ───────────────────────────── */}
        <section className="features-section" id="features">
          <div className="section-header">
            <p className="section-tag">Features</p>
            <h2 className="section-title">Everything you need to write and review code</h2>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-box"><Code2 size={20} /></div>
              <h3>Code Studio</h3>
              <p>Browser-based Monaco editor with syntax highlighting, multiple files, auto-indent, code folding, and search — feels like a lightweight VS Code.</p>
            </div>

            <div className="feature-card" id="collaboration">
              <div className="feature-icon-box"><Users size={20} /></div>
              <h3>Real-Time Collaboration</h3>
              <p>Shared workspaces with live editing, cursor presence, and user indicators. Multiple developers working on the same project simultaneously.</p>
            </div>

            <div className="feature-card" id="ai-review">
              <div className="feature-icon-box"><Sparkles size={20} /></div>
              <h3>AI-Assisted Review</h3>
              <p>Powered by Gemini — identifies errors, code quality issues, security concerns, performance problems, and gives improvement suggestions.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-box"><ShieldCheck size={20} /></div>
              <h3>Sandboxed Execution</h3>
              <p>Docker-isolated containers with CPU, memory, and timeout limits. Your code runs safely without touching the host system.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-box"><Play size={20} /></div>
              <h3>Live Preview</h3>
              <p>Instant HTML/CSS/JS preview in the browser. Edit your code and see changes reflected immediately.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-box"><Terminal size={20} /></div>
              <h3>Console & Output</h3>
              <p>Built-in console, problems panel, and output terminal. Runtime errors displayed clearly with line references.</p>
            </div>
          </div>
        </section>

        {/* ── Supported Languages ──────────────────────────────── */}
        <section className="languages-section">
          <div className="section-header">
            <p className="section-tag">Languages</p>
            <h2 className="section-title">Write in the languages you use</h2>
          </div>
          <div className="languages-grid">
            {LANGUAGES.map(lang => (
              <div key={lang.name} className="lang-card">
                {lang.icon}
                <span>{lang.name}</span>
              </div>
            ))}
          </div>
          <p className="languages-future">Optimized lightweight sandboxes for Web Development, JavaScript, and Python.</p>
        </section>

        {/* ── How It Works ─────────────────────────────────────── */}
        <section className="how-section" id="how-it-works">
          <div className="section-header">
            <p className="section-tag">How It Works</p>
            <h2 className="section-title">From idea to reviewed code in minutes</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div key={step.num} className="step-card">
                <span className="step-num">{step.num}</span>
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
                {i < STEPS.length - 1 && <ChevronRight size={16} className="step-arrow" />}
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ───────────────────────────────────────── */}
        <section className="bottom-cta-section">
          <div className="bottom-cta-card">
            <h2>Ready to start coding together?</h2>
            <p>Join developers building and reviewing code on Code<span className="codenest-animated-nest">Nest</span>.</p>
            <div className="bottom-cta-buttons">
              <Link to="/signup" className="btn btn-primary btn-lg">
                Create Free Account <ArrowRight size={16} />
              </Link>
              <Link to="/playground" className="btn btn-secondary btn-lg">
                Try Playground
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Logo size="lg" />
            </Link>
            <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Where code comes together.</p>
            <p className="footer-secondary-tagline">A <span className="codenest-animated-nest" style={{ fontWeight: 600 }}>nest</span> for collaborative review.</p>
          </div>
          <div className="footer-links">
            <Link to="/playground">Playground</Link>
            <Link to="/signin">Sign In</Link>
            <Link to="/signup">Sign Up</Link>
          </div>
          <div className="footer-copy">
            &copy; {new Date().getFullYear()} Code<span className="codenest-animated-nest">Nest</span>. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
