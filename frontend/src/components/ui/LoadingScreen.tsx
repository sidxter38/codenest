import React from 'react'
import { Logo } from './Logo'

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Logo size="lg" />
      <div className="spinner" style={{ marginTop: '16px' }} />
    </div>
  )
}
