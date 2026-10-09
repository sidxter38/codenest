import React from 'react'

export function AuthAtmosphere() {
  return (
    <div className="auth-atmosphere" aria-hidden="true">
      <video
        className="auth-atmosphere-video"
        src="/gradient-flow.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="auth-atmosphere-scrim" />
    </div>
  )
}
