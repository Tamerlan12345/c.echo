'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  useTracks,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track, RoomEvent, ConnectionQuality, ParticipantEvent } from 'livekit-client'
import {
  Mic, MicOff, Video, VideoOff, Monitor, Users,
  PhoneOff, Bot, Shield, CheckCircle2, XCircle,
  Circle, StopCircle, X, LogOut, MessageSquare, Send,
  Globe, Copy, Check, Calendar, Lock, Hand, Smile, VolumeX
} from 'lucide-react'
import { livekitApi, meetingsApi, consentApi, authApi } from '@/lib/api'
import type { Meeting, User, ConsentStatus } from '@centras/shared'
import styles from './room.module.css'
import { Logo, LogoIcon } from '@/components/Logo'

// ─── Connection Quality Indicator Component ───────────────────────────────────

function ConnectionQualityBar({ participant }: { participant: any }) {
  const [quality, setQuality] = useState<ConnectionQuality>(participant.connectionQuality)

  useEffect(() => {
    const handleQualityChanged = (q: ConnectionQuality) => {
      setQuality(q)
    }
    participant.on(ParticipantEvent.ConnectionQualityChanged, handleQualityChanged)
    setQuality(participant.connectionQuality)
    return () => {
      participant.off(ParticipantEvent.ConnectionQualityChanged, handleQualityChanged)
    }
  }, [participant])

  let color = 'rgba(255, 255, 255, 0.2)'
  let bars = 0
  let label = 'Неизвестно'

  if (quality === ConnectionQuality.Excellent) {
    color = 'var(--color-success)'
    bars = 3
    label = 'Отличное'
  } else if (quality === ConnectionQuality.Good) {
    color = 'var(--color-accent-amber)'
    bars = 2
    label = 'Хорошее'
  } else if (quality === ConnectionQuality.Poor) {
    color = 'var(--color-danger)'
    bars = 1
    label = 'Плохое'
  }

  return (
    <div className={styles.qualityIndicator} title={`Качество связи: ${label}`}>
      <span className={styles.qualityBar} style={{ height: '30%', backgroundColor: bars >= 1 ? color : 'rgba(255,255,255,0.15)' }} />
      <span className={styles.qualityBar} style={{ height: '60%', backgroundColor: bars >= 2 ? color : 'rgba(255,255,255,0.15)' }} />
      <span className={styles.qualityBar} style={{ height: '100%', backgroundColor: bars >= 3 ? color : 'rgba(255,255,255,0.15)' }} />
    </div>
  )
}

// ─── Main page (token fetching layer) ─────────────────────────────────────────

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>('')
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Guest welcome screen states
  const [showWelcome, setShowWelcome] = useState(false)
  const [publicInfo, setPublicInfo] = useState<{ id: string; title: string; scheduledStart: string | null; isPublic: boolean; creatorName: string } | null>(null)
  const [guestName, setGuestName] = useState('')
  const [loggingInGuest, setLoggingInGuest] = useState(false)
  const [copied, setCopied] = useState(false)

  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false)
  const [isEnded, setIsEnded] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const init = useCallback(async () => {
    // 1. Try to load authenticated user profile
    const meRes = await authApi.me({ skipRedirect: true })

    if ('error' in meRes) {
      // User is not authenticated. Check if meeting is public
      const pubRes = await meetingsApi.getPublicInfo(id)
      if ('data' in pubRes && pubRes.data && pubRes.data.isPublic) {
        setPublicInfo(pubRes.data)
        setShowWelcome(true)
      } else {
        setError('Для доступа к этой конференции требуется авторизация')
      }
      return
    }

    // Check waiting room status
    const statusRes = await meetingsApi.getWaitingStatus(id)
    if ('data' in statusRes && statusRes.data) {
      const { status } = statusRes.data
      if (status === 'pending') {
        setIsInWaitingRoom(true)
        if (!publicInfo) {
          const pubRes = await meetingsApi.getPublicInfo(id)
          if ('data' in pubRes && pubRes.data) setPublicInfo(pubRes.data)
        }
        return
      } else if (status === 'rejected') {
        setError('Организатор отклонил ваш запрос на вход в эту конференцию')
        return
      } else if (status === 'none') {
        // Request to join waiting room
        const joinRes = await meetingsApi.joinWaitingRoom(id)
        if ('data' in joinRes && joinRes.data) {
          if (joinRes.data.status === 'pending') {
            setIsInWaitingRoom(true)
            if (!publicInfo) {
              const pubRes = await meetingsApi.getPublicInfo(id)
              if ('data' in pubRes && pubRes.data) setPublicInfo(pubRes.data)
            }
            return
          }
        } else {
          setError('Не удалось войти в зал ожидания')
          return
        }
      }
    }

    // 2. User is authenticated (or logged in as guest). Join the meeting first to ensure access in DB.
    const joinRes = await meetingsApi.join(id)
    if ('error' in joinRes) {
      setError(joinRes.error?.message ?? 'Не удалось присоединиться к конференции')
      return
    }

    // 3. Fetch meeting details and LiveKit token.
    const [meetRes, tokenRes] = await Promise.all([
      meetingsApi.get(id),
      livekitApi.token(id),
    ])

    if ('error' in meetRes) {
      setError(meetRes.error?.message ?? 'Встреча не найдена')
      return
    }
    if ('error' in tokenRes) {
      setError(tokenRes.error?.message ?? 'Ошибка подключения')
      return
    }

    setUser(meRes.data)
    setMeeting(meetRes.data)
    setToken(tokenRes.data.token)
    setServerUrl(tokenRes.data.serverUrl)
    setShowWelcome(false)
    setIsInWaitingRoom(false)
  }, [id, publicInfo])

  useEffect(() => {
    init()
  }, [id])

  // Poll waiting room status
  useEffect(() => {
    if (!isInWaitingRoom) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    pollIntervalRef.current = setInterval(async () => {
      const res = await meetingsApi.getWaitingStatus(id)
      if ('data' in res && res.data) {
        const { status } = res.data
        if (status === 'admitted') {
          setIsInWaitingRoom(false)
          init()
        } else if (status === 'rejected') {
          setIsInWaitingRoom(false)
          setError('Организатор отклонил ваш запрос на вход в эту конференцию')
        }
      }
    }, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isInWaitingRoom, id, init])

  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestName.trim()) return
    setLoggingInGuest(true)

    const res = await authApi.guestLogin(guestName.trim())
    if ('data' in res && res.data) {
      await init()
    } else {
      setError('Не удалось подключиться в качестве гостя')
    }
    setLoggingInGuest(false)
  }

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (error) {
    return (
      <div className={styles.loadingRoom}>
        <XCircle size={48} color="var(--color-danger)" />
        <p style={{ color: 'var(--color-danger)', textAlign: 'center', marginTop: 16 }}>{error}</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => router.push('/dashboard')}>
          На главную
        </button>
      </div>
    )
  }

  if (isEnded) {
    return (
      <div className={styles.welcomeLayout}>
        <div className={styles.welcomeCard} style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-8)' }}>
          <div className={styles.welcomeLogo} style={{ marginBottom: 'var(--space-6)' }}>
            <Logo size={42} centered />
          </div>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--color-success-dim)',
            color: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)'
          }}>
            <CheckCircle2 size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Конференция завершена
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', lineHeight: 1.5, margin: 0 }}>
            Вы успешно вышли из конференции.
            <br />
            Эту вкладку браузера можно закрыть.
          </p>
        </div>
      </div>
    )
  }

  if (showWelcome && publicInfo) {
    return (
      <div className={styles.welcomeLayout}>
        <div className={styles.welcomeCard}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLogo}>
              <Logo size={42} centered />
            </div>
            <h1 className={styles.welcomeTitle}>Подключение к конференции</h1>
            <p className={styles.welcomeSubtitle}>Centras Echo · Безопасные видеоконференции</p>
          </div>

          <div className={styles.meetingInfoBox}>
            <h2 className={styles.meetingInfoTitle}>{publicInfo.title}</h2>
            
            <div className={styles.meetingInfoRow}>
              <span>Организатор:</span>
              <span style={{ fontWeight: 600 }}>{publicInfo.creatorName ?? 'Система'}</span>
            </div>

            {publicInfo.scheduledStart && (
              <div className={styles.meetingInfoRow}>
                <span>Запланировано на:</span>
                <span>
                  {new Intl.DateTimeFormat('ru-RU', {
                    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                  }).format(new Date(publicInfo.scheduledStart))}
                </span>
              </div>
            )}

            <div className={styles.meetingInfoRow}>
              <span>Доступ:</span>
              <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Globe size={12} /> Публичный (вход без авторизации)
              </span>
            </div>
          </div>

          <form onSubmit={handleGuestJoin} className={styles.guestForm}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="guest-name" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Представьтесь, чтобы войти в комнату:
              </label>
              <input
                id="guest-name"
                className="input-field"
                type="text"
                placeholder="Ваше имя"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={60}
                required
                autoFocus
              />
            </div>

            <button
              id="guest-join-btn"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.9375rem' }}
              disabled={!guestName.trim() || loggingInGuest}
            >
              {loggingInGuest ? 'Подключение…' : 'Присоединиться к конференции'}
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCopyLink}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {copied ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push('/login')}
                style={{ flex: 1 }}
              >
                Войти через аккаунт
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (isInWaitingRoom && publicInfo) {
    return (
      <div className={styles.welcomeLayout}>
        <div className={styles.welcomeCard}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLogo}>
              <Logo size={42} centered />
            </div>
            <h1 className={styles.welcomeTitle}>Зал ожидания</h1>
            <p className={styles.welcomeSubtitle}>Centras Echo · Контроль доступа</p>
          </div>

          <div className={styles.meetingInfoBox}>
            <h2 className={styles.meetingInfoTitle}>{publicInfo.title}</h2>
            
            <div className={styles.meetingInfoRow}>
              <span>Организатор:</span>
              <span style={{ fontWeight: 600 }}>{publicInfo.creatorName ?? 'Система'}</span>
            </div>

            <div className={styles.meetingInfoRow}>
              <span>Статус:</span>
              <span style={{ color: 'var(--color-accent-amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Circle size={10} fill="var(--color-accent-amber)" /> Ожидание одобрения...
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 'var(--space-4) 0' }}>
            <div className={styles.loadingSpinner} />
            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Вы в зале ожидания. Пожалуйста, подождите, пока организатор одобрит ваше участие во встрече.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => router.push('/dashboard')}
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    )
  }

  if (!token || !meeting || !user) {
    return (
      <div className={styles.loadingRoom}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Подключение к комнате…</p>
      </div>
    )
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={() => {
        const isGuest = user?.email.endsWith('@guest.centras-echo.local')
        if (isGuest) {
          setIsEnded(true)
          sessionStorage.removeItem('centras_access')
          localStorage.removeItem('centras_refresh')
          document.cookie = 'centras_access=; path=/; max-age=0; SameSite=Lax; Secure'
        } else {
          router.push('/dashboard')
        }
      }}
      style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}
    >
      <RoomAudioRenderer />
      <RoomInner meeting={meeting} user={user} meetingId={id} router={router} />
    </LiveKitRoom>
  )
}

// ─── Inner room (has access to LiveKit context) ────────────────────────────────

interface RoomInnerProps {
  meeting: Meeting
  user: User
  meetingId: string
  router: ReturnType<typeof useRouter>
}

interface ChatMessage {
  id: string
  userId: string
  userName: string
  text: string
  timestamp: number
}

function RoomInner({ meeting, user, meetingId, router }: RoomInnerProps) {
  const room = useRoomContext()
  const remoteParticipants = useParticipants().filter((p) => !p.isLocal)
  const { localParticipant } = useLocalParticipant()
  const allParticipants = localParticipant ? [localParticipant, ...remoteParticipants] : remoteParticipants

  const isHost = meeting.creatorId === user.id

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  // UI state
  const [showSenti, setShowSenti] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showParticipants, setShowParticipants] = useState(true)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Reactions + Raise Hand states
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({})
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; identity: string; emoji: string }>>([])
  const [showReactionsMenu, setShowReactionsMenu] = useState(false)

  // Waiting Room state for host
  const [waitingUsers, setWaitingUsers] = useState<any[]>([])
  const prevWaitingCountRef = useRef(0)

  // Noise Suppression state
  const [noiseSuppression, setNoiseSuppression] = useState(false)
  const nsCtxRef = useRef<AudioContext | null>(null)
  const nsOriginalTrackRef = useRef<any>(null)
  const nsPublishedTrackRef = useRef<any>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Clear unread when opening chat
  useEffect(() => {
    if (showChat) setUnreadCount(0)
  }, [showChat])

  // Media state (derived from LiveKit)
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

  // Recording state
  const [isRecording, setIsRecording] = useState(meeting.isRecorded)
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null)

  // Client-side recording references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const activeSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map())

  // Timer
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])

  // Poll consent status when Senti panel is open
  const pollConsent = useCallback(async () => {
    const res = await consentApi.status(meetingId)
    if ('data' in res && res.data) setConsentStatus(res.data)
  }, [meetingId])

  useEffect(() => {
    if (!showSenti) return
    pollConsent()
    const iv = setInterval(pollConsent, 3000)
    return () => clearInterval(iv)
  }, [showSenti, pollConsent])

  // Poll waiting room if host
  useEffect(() => {
    if (!isHost) return
    const fetchWaiting = async () => {
      const res = await meetingsApi.getWaitingList(meetingId)
      if ('data' in res && res.data) {
        setWaitingUsers(res.data)
      }
    }
    fetchWaiting()
    const iv = setInterval(fetchWaiting, 3000)
    return () => clearInterval(iv)
  }, [isHost, meetingId])

  // Audio chime if user joins waiting room
  useEffect(() => {
    if (waitingUsers.length > prevWaitingCountRef.current) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        
        osc.type = 'sine'
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15) // A5
        
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
        
        osc.start()
        osc.stop(audioCtx.currentTime + 0.4)
      } catch (e) {
        // Autoplay policy bypass
      }
    }
    prevWaitingCountRef.current = waitingUsers.length
  }, [waitingUsers])

  // Listen to LiveKit DataChannel
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      try {
        const decoder = new TextDecoder()
        const data = JSON.parse(decoder.decode(payload))
        if (data.type === 'consent_updated') {
          pollConsent()
        } else if (data.type === 'request_consent') {
          if (!isHost) {
            setShowConsentModal(true)
          }
        } else if (data.type === 'mute_participant') {
          if (data.targetIdentity === localParticipant?.identity) {
            localParticipant.setMicrophoneEnabled(false)
            setMicEnabled(false)
          }
        } else if (data.type === 'recording_started') {
          setIsRecording(true)
        } else if (data.type === 'recording_stopped') {
          setIsRecording(false)
        } else if (data.type === 'raise_hand') {
          setRaisedHands((prev) => ({ ...prev, [participant.identity]: data.raised }))
        } else if (data.type === 'reaction') {
          const id = Math.random().toString(36).substr(2, 9)
          setFloatingReactions((prev) => [...prev, { id, identity: participant.identity, emoji: data.emoji }])
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id))
          }, 3000)
        } else if (data.type === 'chat') {
          const newMsg: ChatMessage = {
            id: Math.random().toString(36).substr(2, 9),
            userId: participant?.identity || 'unknown',
            userName: participant?.name || 'Гость',
            text: data.text,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, newMsg])
          if (!showChat) setUnreadCount((c) => c + 1)
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err)
      }
    }

    const handleParticipantDisconnected = (p: any) => {
      setRaisedHands((prev) => {
        const copy = { ...prev }
        delete copy[p.identity]
        return copy
      })
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    }
  }, [room, isHost, pollConsent, showChat, localParticipant])

  const handleMuteParticipant = async (targetIdentity: string) => {
    if (!localParticipant || !isHost) return
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify({ type: 'mute_participant', targetIdentity }))
      await localParticipant.publishData(data, { reliable: true })
    } catch (err) {
      console.error('Failed to broadcast mute participant signal:', err)
    }
  }

  // Waiting Room Host Actions
  const handleAdmit = async (targetUserId: string) => {
    const res = await meetingsApi.admitUser(meetingId, targetUserId)
    if ('data' in res) {
      setWaitingUsers((prev) => prev.filter((u) => u.userId !== targetUserId))
    }
  }

  const handleReject = async (targetUserId: string) => {
    const res = await meetingsApi.rejectUser(meetingId, targetUserId)
    if ('data' in res) {
      setWaitingUsers((prev) => prev.filter((u) => u.userId !== targetUserId))
    }
  }

  // Reactions & Raise Hand Actions
  const sendReaction = async (emoji: string) => {
    if (!localParticipant) return
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji }))
      await localParticipant.publishData(data, { reliable: true })
      
      // Show locally immediately
      const id = Math.random().toString(36).substr(2, 9)
      setFloatingReactions((prev) => [...prev, { id, identity: localParticipant.identity, emoji }])
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id))
      }, 3000)
    } catch (err) {
      console.error('Failed to publish reaction:', err)
    }
    setShowReactionsMenu(false)
  }

  const toggleRaiseHand = async () => {
    if (!localParticipant) return
    try {
      const nextState = !raisedHands[localParticipant.identity]
      setRaisedHands((prev) => ({ ...prev, [localParticipant.identity]: nextState }))
      
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify({ type: 'raise_hand', raised: nextState }))
      await localParticipant.publishData(data, { reliable: true })
    } catch (err) {
      console.error('Failed to publish raise hand:', err)
    }
  }

  // Noise Suppression Action
  const toggleNoiseSuppression = async () => {
    if (!localParticipant) return
    try {
      if (noiseSuppression) {
        setNoiseSuppression(false)
        if (nsCtxRef.current) {
          await nsCtxRef.current.close()
          nsCtxRef.current = null
        }
        if (nsPublishedTrackRef.current) {
          await localParticipant.unpublishTrack(nsPublishedTrackRef.current.track)
          nsPublishedTrackRef.current = null
        }
        // Restore default mic
        await localParticipant.setMicrophoneEnabled(true)
        setMicEnabled(true)
      } else {
        setNoiseSuppression(true)
        
        // 1. Get raw media stream from microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        
        // 2. Web Audio setup
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioContextClass()
        nsCtxRef.current = ctx
        
        const source = ctx.createMediaStreamSource(stream)
        
        // Low frequency cut filter (120Hz highpass)
        const hpFilter = ctx.createBiquadFilter()
        hpFilter.type = 'highpass'
        hpFilter.frequency.value = 120
        
        // High frequency bandpass to keep speech range (80Hz to 6000Hz)
        const lpFilter = ctx.createBiquadFilter()
        lpFilter.type = 'lowpass'
        lpFilter.frequency.value = 6000
        
        // Noise Gate compressor
        const gate = ctx.createDynamicsCompressor()
        gate.threshold.value = -42 // Attenuate audio below -42dB
        gate.knee.value = 12
        gate.ratio.value = 15
        gate.attack.value = 0.003 // Quick open
        gate.release.value = 0.12 // Smooth close
        
        const dest = ctx.createMediaStreamDestination()
        
        source.connect(hpFilter)
        hpFilter.connect(lpFilter)
        lpFilter.connect(gate)
        gate.connect(dest)
        
        const cleanTrack = dest.stream.getAudioTracks()[0]
        
        // Unpublish current microphone
        const micPublication = localParticipant.getTrackPublication(Track.Source.Microphone)
        if (micPublication && micPublication.track) {
          nsOriginalTrackRef.current = micPublication.track
          await localParticipant.unpublishTrack(micPublication.track)
        }
        
        // Publish clean track
        const pub = await localParticipant.publishTrack(cleanTrack, {
          name: 'microphone-clean',
          source: Track.Source.Microphone
        })
        nsPublishedTrackRef.current = pub
        setMicEnabled(true)
      }
    } catch (err) {
      console.error('Failed to toggle noise suppression:', err)
      setNoiseSuppression(false)
    }
  }

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !localParticipant) return
    const msg = { type: 'chat', text: chatInput }
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(msg))
    await localParticipant.publishData(data, { reliable: true })
    
    setMessages((prev) => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      userId: localParticipant.identity,
      userName: localParticipant.name || user.name || 'Вы',
      text: chatInput,
      timestamp: Date.now(),
    }])
    setChatInput('')
  }

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(!micEnabled)
    setMicEnabled((v) => !v)
  }, [localParticipant, micEnabled])

  // Toggle camera
  const toggleCam = useCallback(async () => {
    await localParticipant.setCameraEnabled(!camEnabled)
    setCamEnabled((v) => !v)
  }, [localParticipant, camEnabled])

  // Toggle screen share
  const toggleScreen = useCallback(async () => {
    if (screenSharing) {
      await localParticipant.setScreenShareEnabled(false)
    } else {
      await localParticipant.setScreenShareEnabled(true)
    }
    setScreenSharing((v) => !v)
  }, [localParticipant, screenSharing])

  // Give consent
  const handleGiveConsent = async () => {
    await consentApi.give(meetingId)
    await pollConsent()
    setShowConsentModal(false)

    // Broadcast consent update via DataChannel
    if (localParticipant) {
      try {
        const encoder = new TextEncoder()
        const data = encoder.encode(JSON.stringify({ type: 'consent_updated' }))
        await localParticipant.publishData(data, { reliable: true })
      } catch (err) {
        console.error('Failed to broadcast consent update:', err)
      }
    }
  }

  // Request consent (host only)
  const handleRequestConsent = async () => {
    if (localParticipant) {
      try {
        const encoder = new TextEncoder()
        const data = encoder.encode(JSON.stringify({ type: 'request_consent' }))
        await localParticipant.publishData(data, { reliable: true })
      } catch (err) {
        console.error('Failed to broadcast consent request:', err)
      }
    }

    await pollConsent()
    
    // Show local ConsentModal for host as well if they haven't consented
    const myConsent = consentStatus?.participants?.find((p) => p.userId === user.id)
    if (!myConsent?.hasConsented) {
      setShowConsentModal(true)
    }
  }

  // Helpers for client-side recording
  const stopAndUploadRecording = () => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve()
        return
      }
      (window as any)._resolveUpload = resolve
      mediaRecorderRef.current.stop()
    })
  }

  // Start recording (host only)
  const handleStartRecording = async () => {
    if (!localParticipant) return
    try {
      // 1. Initialize Web Audio API Mixer
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioCtx = new AudioContextClass()
      const dest = audioCtx.createMediaStreamDestination()

      audioContextRef.current = audioCtx
      audioDestRef.current = dest
      activeSourcesRef.current.clear()

      // Function to safely connect a track stream to the destination mixer
      const connectStream = (stream: MediaStream, id: string) => {
        if (activeSourcesRef.current.has(id)) return
        try {
          if (stream.getAudioTracks().length === 0) return
          const source = audioCtx.createMediaStreamSource(stream)
          source.connect(dest)
          activeSourcesRef.current.set(id, source)
        } catch (e) {
          console.error(`Failed to connect stream to audio mixer for ${id}:`, e)
        }
      }

      // Connect local participant microphone
      const localStream = localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStream
      if (localStream) {
        connectStream(localStream, localParticipant.identity)
      }

      // Connect existing remote participants
      remoteParticipants.forEach((p) => {
        const stream = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStream
        if (stream) {
          connectStream(stream, p.identity)
        }
      })

      // Dynamically connect new participants who join or enable mic during recording
      const onTrackSubscribed = (track: any, publication: any, participant: any) => {
        if (track.kind === 'audio' && track.mediaStream) {
          connectStream(track.mediaStream, participant.identity)
        }
      }

      room.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      ;(window as any)._onTrackSubscribed = onTrackSubscribed

      // 2. Initialize MediaRecorder
      const options = { mimeType: 'audio/webm;codecs=opus' }
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(dest.stream, options)
      } catch (e) {
        recorder = new MediaRecorder(dest.stream) // Safari fallback
      }

      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      recorder.onstop = async () => {
        room.off(RoomEvent.TrackSubscribed, (window as any)._onTrackSubscribed)
        if (audioContextRef.current) {
          await audioContextRef.current.close()
        }

        const blob = new Blob(chunks, { type: recorder.mimeType })
        const ext = recorder.mimeType.includes('webm') ? '.webm' : recorder.mimeType.includes('ogg') ? '.ogg' : '.mp3'
        const file = new File([blob], `meeting-${meetingId}${ext}`, { type: recorder.mimeType })

        // Upload mixed audio recording to server
        const uploadRes = await meetingsApi.uploadAudio(meetingId, file)
        if ('error' in uploadRes) {
          alert(`Не удалось загрузить аудиозапись встречи: ${uploadRes.error?.message}`)
        }

        if ((window as any)._resolveUpload) {
          (window as any)._resolveUpload()
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)

      // Notify backend and update state in DB
      const res = await livekitApi.startRecording(meetingId)
      if ('error' in res) {
        alert(`Не удалось запустить запись в базе: ${res.error?.message}`)
      }

      // Broadcast signal to other participants via DataChannel
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify({ type: 'recording_started' }))
      await localParticipant.publishData(data, { reliable: true })

    } catch (err: any) {
      alert(`Ошибка доступа к аудиоустройствам записи: ${err.message}`)
    }
  }

  // Stop recording (host only)
  const handleStopRecording = async () => {
    await livekitApi.stopRecording(meetingId)

    // Broadcast stop signal to other participants
    if (localParticipant) {
      try {
        const encoder = new TextEncoder()
        const data = encoder.encode(JSON.stringify({ type: 'recording_stopped' }))
        await localParticipant.publishData(data, { reliable: true })
      } catch (err) {
        console.error('Failed to broadcast recording stop:', err)
      }
    }

    await stopAndUploadRecording()
    setIsRecording(false)
  }

  // Leave call (just exit, don't end)
  const handleLeaveCall = async () => {
    if (isHost && isRecording) {
      await livekitApi.stopRecording(meetingId)
      await stopAndUploadRecording()
    }
    room.disconnect()
    router.push('/dashboard')
  }

  // End call
  const handleEndCall = async () => {
    if (isRecording) {
      await livekitApi.stopRecording(meetingId)
      await stopAndUploadRecording()
    }
    await meetingsApi.end(meetingId)
    room.disconnect()
    router.push('/dashboard')
  }

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div className={styles.roomLayout}>
      {/* ── Participants sidebar ── */}
      <aside className={`${styles.participantsSidebar} ${!showParticipants ? styles.collapsed : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Участники</span>
          <span className={styles.participantCount}>{allParticipants.length}</span>
        </div>

        {/* Waiting Room Section for Host */}
        {isHost && waitingUsers.length > 0 && (
          <div className={styles.waitingRoomSection}>
            <div className={styles.waitingRoomSubheader}>В зале ожидания ({waitingUsers.length})</div>
            <div className={styles.waitingList}>
              {waitingUsers.map((u) => (
                <div key={u.userId} className={styles.waitingItem}>
                  <span className={styles.waitingName} title={u.name}>{u.name}</span>
                  <div className={styles.waitingActions}>
                    <button className={styles.waitBtnAdmit} onClick={() => handleAdmit(u.userId)} title="Разрешить вход">
                      <Check size={12} />
                    </button>
                    <button className={styles.waitBtnReject} onClick={() => handleReject(u.userId)} title="Отклонить">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.participantsList}>
          {allParticipants.map((p) => {
            const isSpeaking = p.isSpeaking
            const displayName = p.isLocal ? (p.name || user.name || 'Вы') : (p.name || p.identity)
            const initials = displayName && displayName !== 'unknown'
              ? displayName.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
              : '??'
            const micPub = p.getTrackPublication(Track.Source.Microphone)
            const camPub = p.getTrackPublication(Track.Source.Camera)
            const isMuted = !micPub?.isMuted === false || !micPub?.track

            return (
              <div key={p.identity} className={styles.participantItem}>
                <div className={styles.participantAvatar}>
                  <div className="avatar avatar-sm">{initials}</div>
                  {isSpeaking && <div className={styles.participantSpeaking} />}
                </div>
                <div className={styles.participantInfo}>
                  <div className={styles.participantName}>
                    {displayName}
                    {p.isLocal && ' (вы)'}
                  </div>
                  {p.identity === meeting.creatorId && (
                    <div className={styles.participantRole}>Организатор</div>
                  )}
                </div>
                <div className={styles.participantIcons}>
                  {raisedHands[p.identity] && (
                    <span className={styles.raisedHandSidebarBadge} title="Поднята рука">✋</span>
                  )}
                  <ConnectionQualityBar participant={p} />
                  {isMuted ? (
                    <MicOff size={14} className={styles.mutedIcon} />
                  ) : (
                    isHost && !p.isLocal ? (
                      <button
                        className={styles.muteActionBtn}
                        onClick={() => handleMuteParticipant(p.identity)}
                        title="Выключить микрофон участника"
                        aria-label={`Выключить микрофон ${p.name ?? p.identity}`}
                      >
                        <Mic size={14} />
                      </button>
                    ) : (
                      <Mic size={14} />
                    )
                  )}
                  {!camPub?.track && <VideoOff size={14} />}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Video area ── */}
      <div className={styles.videoArea}>
        {/* Header */}
        <div className={styles.videoHeader}>
          <span className={styles.meetingTitle}>{meeting.title}</span>
          <div className={styles.meetingMeta}>
            {isRecording && (
              <span className={styles.recordingBadge}>
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                REC
              </span>
            )}
            <span className={styles.timer}>{formatTimer(elapsed)}</span>
          </div>
        </div>

        {/* LiveKit video grid */}
        <div className={styles.videoGrid}>
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>

          {/* Floating reactions layer */}
          <div className={styles.reactionsLayer}>
            {floatingReactions.map((reaction) => {
              const p = allParticipants.find((x) => x.identity === reaction.identity)
              const name = p?.name || 'Участник'
              return (
                <div key={reaction.id} className={styles.floatingReaction}>
                  <span className={styles.reactionEmoji}>{reaction.emoji}</span>
                  <span className={styles.reactionName}>{name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controlsBar}>
          {/* Left: participants + layout */}
          <div className={styles.controlsLeft}>
            <Tooltip label={showParticipants ? 'Скрыть участников' : 'Показать участников'}>
              <button
                id="toggle-participants-btn"
                className={`${styles.controlBtn} ${showParticipants ? styles.active : ''}`}
                onClick={() => setShowParticipants((v) => !v)}
                aria-label="Участники"
              >
                <Users size={20} />
              </button>
            </Tooltip>
          </div>

          {/* Center: mic, cam, screen, hand, reactions, noise suppression, end */}
          <div className={styles.controlsCenter}>
            <div className={styles.controlGroup}>
              <Tooltip label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}>
                <button
                  id="toggle-mic-btn"
                  className={`${styles.controlBtn} ${!micEnabled ? styles.muted : ''}`}
                  onClick={toggleMic}
                  aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
                >
                  {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>{micEnabled ? 'Микрофон' : 'Без звука'}</span>
            </div>

            <div className={styles.controlGroup}>
              <Tooltip label={camEnabled ? 'Выключить камеру' : 'Включить камеру'}>
                <button
                  id="toggle-cam-btn"
                  className={`${styles.controlBtn} ${!camEnabled ? styles.muted : ''}`}
                  onClick={toggleCam}
                  aria-label={camEnabled ? 'Выключить камеру' : 'Включить камеру'}
                >
                  {camEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>{camEnabled ? 'Камера' : 'Камера откл.'}</span>
            </div>

            <div className={styles.controlGroup}>
              <Tooltip label={screenSharing ? 'Остановить трансляцию' : 'Показать экран'}>
                <button
                  id="toggle-screen-btn"
                  className={`${styles.controlBtn} ${screenSharing ? styles.active : ''}`}
                  onClick={toggleScreen}
                  aria-label="Демонстрация экрана"
                >
                  <Monitor size={20} />
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>{screenSharing ? 'Трансляция' : 'Экран'}</span>
            </div>

            {/* Raise Hand */}
            <div className={styles.controlGroup}>
              <Tooltip label={raisedHands[localParticipant?.identity || ''] ? 'Опустить руку' : 'Поднять руку'}>
                <button
                  id="toggle-raise-hand-btn"
                  className={`${styles.controlBtn} ${raisedHands[localParticipant?.identity || ''] ? styles.active : ''}`}
                  onClick={toggleRaiseHand}
                  aria-label="Поднять руку"
                >
                  <Hand size={20} />
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>
                {raisedHands[localParticipant?.identity || ''] ? 'Опустить' : 'Поднять'}
              </span>
            </div>

            {/* Reactions (Smile menu) */}
            <div className={styles.controlGroup} style={{ position: 'relative' }}>
              <Tooltip label="Реакции">
                <button
                  id="toggle-reactions-btn"
                  className={`${styles.controlBtn} ${showReactionsMenu ? styles.active : ''}`}
                  onClick={() => setShowReactionsMenu((v) => !v)}
                  aria-label="Реакции"
                >
                  <Smile size={20} />
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>Реакции</span>
              
              {showReactionsMenu && (
                <div className={styles.reactionsMenu}>
                  {['👍', '👏', '❤️', '😂', '🎉', '😮'].map((emoji) => (
                    <button
                      key={emoji}
                      className={styles.reactionMenuBtn}
                      onClick={() => sendReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Noise Suppression */}
            <div className={styles.controlGroup}>
              <Tooltip label={noiseSuppression ? 'Отключить шумоподавление' : 'Включить шумоподавление'}>
                <button
                  id="toggle-noise-suppression-btn"
                  className={`${styles.controlBtn} ${noiseSuppression ? styles.active : ''}`}
                  onClick={toggleNoiseSuppression}
                  aria-label="Шумоподавление"
                >
                  <VolumeX size={20} />
                </button>
              </Tooltip>
              <span className={styles.controlLabel}>
                {noiseSuppression ? 'Шум откл.' : 'Шумопод.'}
              </span>
            </div>

            <button
              id="end-call-btn"
              className={styles.endCallBtn}
              onClick={() => {
                if (isHost) {
                  setShowEndConfirm(true)
                } else {
                  handleLeaveCall()
                }
              }}
              aria-label={isHost ? "Завершить звонок" : "Выйти из звонка"}
            >
              {isHost ? <PhoneOff size={18} /> : <LogOut size={18} />}
              {isHost ? 'Завершить' : 'Выйти'}
            </button>
          </div>

          {/* Right: Senti + Chat */}
          <div className={styles.controlsRight}>
            <Tooltip label={showChat ? 'Закрыть чат' : 'Открыть чат'}>
              <div className={styles.controlBtnBadge}>
                <button
                  id="toggle-chat-btn"
                  className={`${styles.controlBtn} ${showChat ? styles.active : ''}`}
                  onClick={() => {
                    setShowChat((v) => !v)
                    if (showSenti) setShowSenti(false)
                  }}
                  aria-label="Чат встречи"
                >
                  <MessageSquare size={20} />
                </button>
                {unreadCount > 0 && !showChat && (
                  <span className={styles.unreadBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </div>
            </Tooltip>
            {isHost && (
              <Tooltip label={showSenti ? 'Закрыть Senti' : 'Открыть Senti-протокол'}>
                <button
                  id="toggle-senti-btn"
                  className={`${styles.controlBtn} ${showSenti ? styles.sentiActive : ''}`}
                  onClick={() => setShowSenti((v) => !v)}
                  aria-label="Senti протокол"
                >
                  <Bot size={20} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* ── Chat Panel ── */}
      {showChat && (
        <aside className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.chatTitle}>
              <MessageSquare size={18} color="var(--color-accent-blue)" />
              Чат встречи
            </div>
            <button
              className={styles.controlBtn}
              style={{ width: 32, height: 32 }}
              onClick={() => setShowChat(false)}
              aria-label="Закрыть чат"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.chatMessages}>
            {messages.length === 0 ? (
              <div className={styles.chatEmpty}>
                <div className={styles.chatEmptyIcon}>
                  <MessageSquare size={24} />
                </div>
                <p className={styles.chatEmptyText}>
                  Сообщений пока нет.<br />Напишите первым!
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.userId === localParticipant?.identity
                return (
                  <div
                    key={m.id}
                    className={`${styles.chatMessage} ${isMine ? styles.chatMessageMine : styles.chatMessageOther}`}
                  >
                    <span className={styles.chatMessageSender}>
                      {m.userName} {isMine && ' (Вы)'}
                    </span>
                    <div className={`${styles.chatBubble} ${isMine ? styles.chatBubbleMine : styles.chatBubbleOther}`}>
                      {m.text}
                    </div>
                    <span className={styles.chatMessageTime}>
                      {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.timestamp))}
                    </span>
                  </div>
                )
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className={styles.chatInputArea}>
            <textarea
              id="chat-input"
              className={styles.chatInput}
              placeholder="Написать сообщение…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(e as unknown as React.FormEvent)
                }
              }}
              rows={1}
              aria-label="Сообщение в чат"
            />
            <button
              id="chat-send-btn"
              className={styles.chatSendBtn}
              onClick={(e) => sendMessage(e as unknown as React.FormEvent)}
              disabled={!chatInput.trim()}
              aria-label="Отправить сообщение"
            >
              <Send size={18} />
            </button>
          </div>
        </aside>
      )}

      {/* ── Senti Panel ── */}
      {showSenti && (
        <aside className={styles.sentiPanel}>
          <div className={styles.sentiHeader}>
            <div className={styles.sentiTitle}>
              <Bot size={18} color="var(--color-accent-amber)" />
              <span className="senti-text">Senti</span>
            </div>
            <button
              className={`${styles.controlBtn} btn-sm`}
              style={{ width: 32, height: 32 }}
              onClick={() => setShowSenti(false)}
              aria-label="Закрыть панель"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.sentiBody}>
            {/* Recording status */}
            {isRecording ? (
              <div className={styles.recordingStatus}>
                <StopCircle size={20} color="var(--color-danger)" />
                <div className={styles.recordingInfo}>
                  <div className={styles.recordingTitle}>Запись идёт</div>
                  <div className={styles.recordingDesc}>Senti анализирует в реальном времени</div>
                </div>
                {isHost && (
                  <button
                    id="stop-recording-btn"
                    className="btn btn-danger btn-sm"
                    onClick={handleStopRecording}
                  >
                    Стоп
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Consent status */}
                {consentStatus && (
                  <div className={styles.consentStatus}>
                    <div className={styles.consentStatusTitle}>Согласия</div>
                    <div className={styles.consentBar}>
                      <div
                        className={styles.consentBarFill}
                        style={{
                          width: consentStatus.total > 0
                            ? `${(consentStatus.consented / consentStatus.total) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                    <div className={styles.consentNumbers}>
                      <span style={{ color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>
                        {consentStatus.consented} дали согласие
                      </span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                        из {consentStatus.total}
                      </span>
                    </div>
                    <div className={styles.consentParticipants}>
                      {consentStatus.participants?.map((p) => (
                          <div key={p.userId} className={styles.consentParticipantRow}>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                              {p.name}
                            </span>
                            {p.hasConsented
                              ? <CheckCircle2 size={14} color="var(--color-success)" className={styles.consentIcon} />
                              : <Circle size={14} color="var(--color-text-muted)" className={styles.consentIcon} />
                            }
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Action button for host */}
                {isHost && consentStatus?.allConsented && !isRecording && (
                  <button
                    id="start-recording-btn"
                    className="btn btn-amber"
                    style={{ width: '100%' }}
                    onClick={handleStartRecording}
                  >
                    <Bot size={18} />
                    Начать запись Senti
                  </button>
                )}

                {isHost && (!consentStatus || !consentStatus.allConsented) && (
                  <button
                    id="request-consent-btn"
                    className="btn btn-ghost"
                    style={{ width: '100%', borderColor: 'rgba(229,0,18,0.35)', color: 'var(--color-accent-amber)' }}
                    onClick={handleRequestConsent}
                  >
                    <Shield size={18} />
                    Запросить согласие
                  </button>
                )}

                {!isHost && (
                  <div className={styles.sentiIdle}>
                    <div className={styles.sentiIdleIcon}>
                      <Bot size={28} />
                    </div>
                    <p className={styles.sentiIdleTitle}>Ожидание хоста</p>
                    <p className={styles.sentiIdleDesc}>
                      Организатор встречи может запустить Senti-протокол после получения согласия всех участников
                    </p>
                    <button
                      id="give-consent-btn"
                      className="btn btn-primary btn-sm"
                      onClick={handleGiveConsent}
                    >
                      <Shield size={16} />
                      Дать согласие заранее
                    </button>
                  </div>
                )}
              </>
            )}

            {!consentStatus && !isRecording && isHost && (
              <div className={styles.sentiIdle}>
                <div className={styles.sentiIdleIcon}>
                  <Bot size={28} />
                </div>
                <p className={styles.sentiIdleTitle}>Senti готов</p>
                <p className={styles.sentiIdleDesc}>
                  Запросите согласие у всех участников, чтобы начать запись и автоматическое протоколирование
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── Consent Modal ── */}
      {showConsentModal && (
        <div className="modal-overlay" onClick={() => setShowConsentModal(false)}>
          <div
            className={`modal-content ${styles.consentModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.consentModalHeader}>
              <div className={styles.consentModalIcon}>
                <Shield size={24} />
              </div>
              <div>
                <h3 className={styles.consentModalTitle}>Согласие на запись</h3>
                <p className={styles.consentModalDesc}>
                  Для запуска Senti-протокола необходимо согласие всех участников встречи на запись и обработку аудио.
                </p>
              </div>
            </div>

            <label className={styles.consentCheckLabel}>
              <input
                type="checkbox"
                id="consent-checkbox"
                onChange={() => {}}
                onClick={handleGiveConsent}
              />
              <span className={styles.consentCheckText}>
                Я даю согласие на запись данной встречи и обработку аудиоданных системой Senti.
                Я понимаю, что запись будет автоматически удалена после создания протокола.
              </span>
            </label>

            <div className={styles.consentActions}>
              <button className="btn btn-ghost" onClick={() => setShowConsentModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Call Confirm ── */}
      {showEndConfirm && (
        <div className="modal-overlay" onClick={() => setShowEndConfirm(false)}>
          <div
            className={`modal-content ${styles.endCallModal}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 450 }}
          >
            <div className={styles.endCallIcon}>
              <PhoneOff size={24} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>
              Завершить встречу или выйти?
            </h3>
            <p style={{ marginBottom: 'var(--space-6)', fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Как организатор, вы можете завершить встречу для всех участников (с сохранением протокола Senti) или просто выйти, оставив встречу активной для остальных.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  id="confirm-end-call-btn"
                  className="btn btn-danger"
                  style={{ flex: 1, padding: '10px 12px', fontSize: '0.875rem' }}
                  onClick={handleEndCall}
                >
                  <PhoneOff size={14} />
                  Завершить для всех
                </button>
                <button
                  id="confirm-leave-call-btn"
                  className="btn btn-ghost"
                  style={{ flex: 1, borderColor: 'var(--color-accent-blue)', color: 'var(--color-accent-blue)', padding: '10px 12px', fontSize: '0.875rem' }}
                  onClick={handleLeaveCall}
                >
                  <LogOut size={14} />
                  Просто выйти
                </button>
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 'var(--space-2)', width: '100%' }} onClick={() => setShowEndConfirm(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tooltip wrapper ──────────────────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.tooltipWrapper}>
      {children}
      <span className={styles.tooltip} role="tooltip">{label}</span>
    </div>
  )
}
