import React from 'react'

export function LogoIcon({ width = 32, height = 32 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Centras.Echo">
      <defs>
        {/* Градиент для рамки подложки */}
        <linearGradient id="logoBorderGrad" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.25)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.03)" />
        </linearGradient>

        {/* Насыщенный корпоративный градиент Centras */}
        <linearGradient id="logoIconGrad" x1="6" y1="11" x2="32" y2="25">
          <stop offset="0%" stopColor="#FF1E27" /> {/* Насыщенный красный */}
          <stop offset="45%" stopColor="#A8006F" /> {/* Глубокий пурпурный */}
          <stop offset="100%" stopColor="#0047E0" /> {/* Яркий синий */}
        </linearGradient>

        {/* Мягкое неоновое свечение */}
        <filter id="logoPremiumGlow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#A8006F" floodOpacity="0.35" />
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0047E0" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* 1. Стеклянная подложка-щит с легким размытием и тонкой рамкой */}
      <rect 
        x="1" 
        y="1" 
        width="34" 
        height="34" 
        rx="10" 
        fill="rgba(13, 18, 30, 0.65)" 
        stroke="url(#logoBorderGrad)" 
        strokeWidth="1.2"
        style={{ backdropFilter: 'blur(8px)' }}
      />

      {/* Группа иконки со свечением */}
      <g filter="url(#logoPremiumGlow)">
        {/* 2. Корпус камеры */}
        <rect x="6" y="11" width="13" height="14" rx="3.5" fill="url(#logoIconGrad)" />
        
        {/* 3. Объектив-рупор */}
        <path d="M20 15L25.5 11.5V24.5L20 21V15Z" fill="url(#logoIconGrad)" />

        {/* 4. Блик света на объективе */}
        <path d="M21 16.5L24 14.5V21.5L21 19.5V16.5Z" fill="#FFFFFF" opacity="0.15" />

        {/* 5. Индикатор записи / Белая линза в камере */}
        <circle cx="9.5" cy="18" r="1.5" fill="#FFFFFF" opacity="0.9" />

        {/* 6. Звуковые волны голосового интеллекта (Senti Secretary) */}
        {/* Ближняя волна */}
        <path 
          d="M29 14.5C30.2 16 30.2 20 29 21.5" 
          stroke="url(#logoIconGrad)" 
          strokeWidth="2" 
          strokeLinecap="round" 
        />
        {/* Дальняя волна (тонкая, с прозрачностью) */}
        <path 
          d="M32 12.5C33.8 14.5 33.8 21.5 32 23.5" 
          stroke="url(#logoIconGrad)" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          opacity="0.55" 
        />
      </g>
    </svg>
  )
}

export function Logo({ size = 32, centered = false }: { size?: number; centered?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      justifyContent: centered ? 'center' : 'flex-start',
      width: centered ? '100%' : 'auto'
    }}>
      {/* Стили для анимации пульсации бейджа SENTI AI */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sentiGlowPulse {
          0% {
            box-shadow: 0 0 6px rgba(255, 107, 0, 0.15), inset 0 1px 0 rgba(255,255,255,0.1);
            border-color: rgba(255, 107, 0, 0.45);
          }
          50% {
            box-shadow: 0 0 14px rgba(255, 107, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.2);
            border-color: rgba(255, 107, 0, 0.8);
          }
          100% {
            box-shadow: 0 0 6px rgba(255, 107, 0, 0.15), inset 0 1px 0 rgba(255,255,255,0.1);
            border-color: rgba(255, 107, 0, 0.45);
          }
        }
      `}} />

      <LogoIcon width={size} height={size} />
      
      <span style={{
        fontFamily: "'Outfit', 'Inter', sans-serif",
        fontSize: `${size * 0.64}px`,
        letterSpacing: '0.010em',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
        lineHeight: 1
      }}>
        {/* Название бренда "centras" */}
        <span style={{
          fontWeight: 900,
          background: 'linear-gradient(135deg, #FF1E27 0%, #A8006F 50%, #0047E0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          paddingBottom: '2px'
        }}>
          centras
        </span>
        
        {/* Разделитель */}
        <span style={{
          fontWeight: 600,
          color: '#A8006F',
          opacity: 0.85,
          margin: '0 5px',
          paddingBottom: '2px'
        }}>
          ·
        </span>
        
        {/* Дополнение "echo" */}
        <span style={{
          fontWeight: 500,
          color: 'var(--logo-echo-color, #0047E0)',
          paddingBottom: '2px'
        }}>
          echo
        </span>

        {/* 🌟 Инновационный бейдж SENTI AI */}
        <span style={{
          fontFamily: "'Outfit', 'Inter', sans-serif",
          fontSize: `${size * 0.32}px`,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #FF7A00 0%, #FFB800 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          border: '1px solid rgba(255, 122, 0, 0.45)',
          backgroundColor: 'rgba(255, 122, 0, 0.09)',
          padding: '3px 8px',
          borderRadius: '20px',
          marginLeft: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          display: 'inline-flex',
          alignItems: 'center',
          height: 'fit-content',
          verticalAlign: 'middle',
          transform: 'translateY(-1px)',
          animation: 'sentiGlowPulse 2.5s infinite ease-in-out',
          userSelect: 'none'
        }}>
          Senti AI
        </span>
      </span>
    </div>
  )
}
