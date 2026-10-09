import React from 'react'
import './AuroraBackground.css'

export function AuroraBackground() {
  return (
    <div className="aurora-container" aria-hidden="true">
      <div className="aurora-gradient-base" />
      <div className="aurora-layer aurora-blob-1" />
      <div className="aurora-layer aurora-blob-2" />
      <div className="aurora-layer aurora-blob-3" />
      <div className="aurora-layer aurora-blob-4" />
      <div className="aurora-stars" />
      <div className="aurora-grid" />
    </div>
  )
}
