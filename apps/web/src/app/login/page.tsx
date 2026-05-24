'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from './login.module.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Вы отменили вход через Google',
  google_token_failed: 'Ошибка при получении токена Google',
  google_profile_failed: 'Не удалось получить профиль Google',
  email_not_verified: 'Email в Google аккаунте не подтверждён',
  not_invited: 'Ваш аккаунт не найден в системе. Обратитесь к администратору.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logoArea}>
            <div className={styles.logoIcon}>
              <span className={styles.spinner} aria-hidden="true" />
            </div>
            <h1 className={styles.logoTitle}>Загрузка...</h1>
          </div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const errorCode = searchParams.get('error')
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      setError(ERROR_MESSAGES[errorCode])
    }
  }, [searchParams])

  const handleGoogleLogin = () => {
    setLoading(true)
    window.location.href = `${API_URL}/api/auth/google`
  }

  return (
    <div className={styles.container}>
      <div className={styles.glowBubble2} aria-hidden="true" />
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoArea}>
          <Logo width={250} height={48} />
        </div>

        <div className={styles.divider} />

        <div className={styles.content}>
          <h2 className={styles.heading}>Добро пожаловать</h2>
          <p className={styles.description}>
            Войдите через корпоративный Google аккаунт, чтобы получить доступ к платформе.
          </p>

          {error && (
            <div className={styles.errorBanner} role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5V8h1.5v3.5zm0-5h-1.5V5h1.5v1.5z"/>
              </svg>
              {error}
            </div>
          )}

          <button
            id="google-login-btn"
            className={styles.googleBtn}
            onClick={handleGoogleLogin}
            disabled={loading}
            aria-label="Войти через Google"
          >
            {loading ? (
              <span className={styles.spinner} aria-hidden="true" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? 'Перенаправление...' : 'Войти через Google'}
          </button>

          <p className={styles.hint}>
            Доступ только для сотрудников Centras.
            <br />
            Не можете войти? Обратитесь к&nbsp;
            <a href="mailto:admin@centras.kz">администратору</a>.
          </p>
        </div>

        {/* Senti mention */}
        <div className={styles.sentiFooter}>
          <div className={styles.sentiDot} aria-hidden="true" />
          <span className={styles.sentiLabel}>
            <span className="senti-text">Senti</span>&nbsp;·&nbsp;Протокол встреч без ручных заметок
          </span>
        </div>
      </div>
    </div>
  )
}

function Logo({ width = 250, height = 48 }: { width?: number | string; height?: number | string }) {
  return (
    <svg viewBox="0 0 250 48" width={width} height={height} fill="none" aria-label="Centras.Echo">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E50012"/>
          <stop offset="40%"  stopColor="#8A005A"/>
          <stop offset="100%" stopColor="#0033A0"/>
        </linearGradient>
        <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.2"/>
        </filter>
      </defs>

      <g transform="translate(8, 9)" filter="url(#logoShadow)">
        <rect x="0" y="6" width="14" height="18" rx="3.5" fill="url(#logoGrad)"/>
        <line x1="3"  y1="11" x2="11" y2="11" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <line x1="3"  y1="15" x2="11" y2="15" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <line x1="3"  y1="19" x2="11" y2="19" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45"/>
        <path d="M14 10 L20 7 L20 23 L14 20Z" fill="url(#logoGrad)"/>
        <path d="M23 12 C24.5 13.5 24.5 16.5 23 18" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M27 10 C30 12.5 30 17.5 27 20" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8"/>
        <path d="M31 8 C35 11.5 35 18.5 31 22" stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
      </g>

      <text x="52" y="32" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="22" letterSpacing="0.020em">
        <tspan fontWeight="900" fill="url(#logoGrad)">centras</tspan>
        <tspan fontWeight="600" fill="#8A005A" fillOpacity="0.95" dx="5">·</tspan>
        <tspan fontWeight="500" fill="var(--logo-echo-color, #0033A0)" dx="4">echo</tspan>
      </text>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M18.17 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h4.59a3.93 3.93 0 01-1.7 2.57v2.14h2.75c1.61-1.49 2.53-3.68 2.53-6.46z" fill="#4285F4"/>
      <path d="M10 18.5c2.3 0 4.23-.76 5.64-2.06l-2.75-2.14c-.76.51-1.73.82-2.89.82-2.22 0-4.1-1.5-4.77-3.52H2.39v2.21A8.5 8.5 0 0010 18.5z" fill="#34A853"/>
      <path d="M5.23 11.6A5.1 5.1 0 015.03 10c0-.55.1-1.09.2-1.6V6.19H2.39A8.5 8.5 0 001.5 10c0 1.37.33 2.67.89 3.81L5.23 11.6z" fill="#FBBC05"/>
      <path d="M10 4.88c1.25 0 2.37.43 3.25 1.27l2.44-2.44C14.23 2.36 12.3 1.5 10 1.5A8.5 8.5 0 002.39 6.19l2.84 2.21C5.9 6.38 7.78 4.88 10 4.88z" fill="#EA4335"/>
    </svg>
  )
}
