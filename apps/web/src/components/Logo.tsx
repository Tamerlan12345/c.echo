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

export function Logo({ width = 250, height = 48 }: { width?: number | string; height?: number | string }) {
  return (
    <svg viewBox="0 0 250 48" width={width} height={height} fill="none" aria-label="Centras.Echo">
      <defs>
        <linearGradient id="sharedLogoGrad" x1="0" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E50012"/>
          <stop offset="40%"  stopColor="#8A005A"/>
          <stop offset="100%" stopColor="#0033A0"/>
        </linearGradient>
        <filter id="sharedLogoShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.2"/>
        </filter>
      </defs>

      <g transform="translate(8, 9)" filter="url(#sharedLogoShadow)">
        <rect x="0" y="6" width="14" height="18" rx="3.5" fill="url(#sharedLogoGrad)"/>
        <line x1="3"  y1="11" x2="11" y2="11" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <line x1="3"  y1="15" x2="11" y2="15" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <line x1="3"  y1="19" x2="11" y2="19" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <path d="M14 10 L20 7 L20 23 L14 20Z" fill="url(#sharedLogoGrad)"/>
        <path d="M23 12 C24.5 13.5 24.5 16.5 23 18" stroke="url(#sharedLogoGrad)" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M27 10 C30 12.5 30 17.5 27 20" stroke="url(#sharedLogoGrad)" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8"/>
        <path d="M31 8 C35 11.5 35 18.5 31 22" stroke="url(#sharedLogoGrad)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
      </g>

      <text x="52" y="32" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="22" letterSpacing="0.020em">
        <tspan fontWeight="900" fill="url(#sharedLogoGrad)">centras</tspan>
        <tspan fontWeight="600" fill="#8A005A" fillOpacity="0.95" dx="5">·</tspan>
        <tspan fontWeight="500" fill="var(--logo-echo-color, #0033A0)" dx="4">echo</tspan>
      </text>
    </svg>
  )
}
