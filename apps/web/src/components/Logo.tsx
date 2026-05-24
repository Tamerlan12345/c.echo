import React from 'react'

export function LogoIcon({ width = 32, height = 32 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 36 36" fill="none" aria-label="Centras.Echo">
      <defs>
        <linearGradient id="sharedLogoIconGrad" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="#E50012"/>
          <stop offset="50%" stopColor="#8A005A"/>
          <stop offset="100%" stopColor="#0033A0"/>
        </linearGradient>
      </defs>
      <rect x="2" y="10" width="18" height="16" rx="4" fill="url(#sharedLogoIconGrad)"/>
      <path d="M20 14L27 10V26L20 22V14Z" fill="url(#sharedLogoIconGrad)"/>
      <path d="M31 13C32.5 15 32.5 21 31 23" stroke="url(#sharedLogoIconGrad)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

export function Logo({ size = 32, centered = false }: { size?: number; centered?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      justifyContent: centered ? 'center' : 'flex-start',
      width: centered ? '100%' : 'auto'
    }}>
      <LogoIcon width={size} height={size} />
      <span style={{
        fontFamily: "'Outfit', 'Inter', sans-serif",
        fontSize: `${size * 0.68}px`,
        letterSpacing: '0.020em',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
        lineHeight: 1
      }}>
        <span style={{
          fontWeight: 900,
          background: 'linear-gradient(135deg, #E50012 0%, #8A005A 50%, #0033A0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          paddingBottom: '2px'
        }}>
          centras
        </span>
        <span style={{
          fontWeight: 600,
          color: '#8A005A',
          opacity: 0.95,
          margin: '0 4px',
          paddingBottom: '2px'
        }}>
          ·
        </span>
        <span style={{
          fontWeight: 500,
          color: 'var(--logo-echo-color, #0033A0)',
          paddingBottom: '2px'
        }}>
          echo
        </span>
      </span>
    </div>
  )
}
