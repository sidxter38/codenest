import React from 'react'
import logoImg from '../../assets/logo.png'
import './Logo.css'

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const pixelSizes = {
    xs: 22,
    sm: 28,
    md: 36,
    lg: 48,
    xl: 64
  }

  const textSizes = {
    xs: '14px',
    sm: '17px',
    md: '20px',
    lg: '25px',
    xl: '32px'
  }

  const px = pixelSizes[size] || 36

  return (
    <div className={`codenest-brand-badge ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'xs' ? '7px' : '10px' }}>
      <img
        src={logoImg}
        alt="CodeNest Logo"
        width={px}
        height={px}
        style={{
          display: 'block',
          objectFit: 'contain',
          borderRadius: '6px'
        }}
      />
      {showText && (
        <span
          className="codenest-wordmark"
          style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 800,
            letterSpacing: '-0.03em',
            fontSize: textSizes[size] || '20px',
            color: '#FFFFFF',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          <span style={{ color: '#FFFFFF' }}>Code</span>
          <span className="codenest-animated-nest">Nest</span>
        </span>
      )}
    </div>
  )
}

export default Logo
