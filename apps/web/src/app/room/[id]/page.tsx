'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  LiveKitRoom,
  VideoConference,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  RoomAudioRenderer,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track, RoomEvent } from 'livekit-client'
import {
  Mic, MicOff, Video, VideoOff, Monitor, Users,
  PhoneOff, Bot, Shield, CheckCircle2, XCircle,
  Circle, StopCircle, X, LogOut,
} from 'lucide-react'
import { livekitApi, meetingsApi, consentApi, authApi } from '@/lib/api'
import type { Meeting, User, ConsentStatus } from '@centras/shared'
import styles from './room.module.css'

// ─── Main page (token fetching layer) ─────────────────────────────────────────

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>('')
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const [meRes, meetRes, tokenRes] = await Promise.all([
        authApi.me(),
        meetingsApi.get(id),
        livekitApi.token(id),
      ])

      if ('error' in meRes) { setError('Не удалось загрузить профиль'); return }
      if ('error' in meetRes) { setError(meetRes.error?.message ?? 'Встреча не найдена'); return }
      if ('error' in tokenRes) { setError(tokenRes.error?.message ?? 'Ошибка подключения'); return }

      setUser(meRes.data)
      setMeeting(meetRes.data)
      setToken(tokenRes.data.token)
      setServerUrl(tokenRes.data.serverUrl)
    }
    init()
  }, [id])

  if (error) {
    return (
      <div className={styles.loadingRoom}>
        <XCircle size={48} color="var(--color-danger)" />
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
          На главную
        </button>
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
      onDisconnected={() => router.push('/dashboard')}
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

function RoomInner({ meeting, user, meetingId, router }: RoomInnerProps) {
  const room = useRoomContext()
  const remoteParticipants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const allParticipants = localParticipant ? [localParticipant, ...remoteParticipants] : remoteParticipants

  const isHost = meeting.creatorId === user.id

  // UI state
  const [showSenti, setShowSenti] = useState(false)
  const [showParticipants, setShowParticipants] = useState(true)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  // Media state (derived from LiveKit)
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null)

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

  // Listen to LiveKit DataChannel
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder()
        const data = JSON.parse(decoder.decode(payload))
        if (data.type === 'consent_updated') {
          pollConsent()
        } else if (data.type === 'request_consent') {
          if (!isHost) {
            setShowConsentModal(true)
          }
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err)
      }
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room, isHost, pollConsent])

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

  // Start recording (host only)
  const handleStartRecording = async () => {
    const res = await livekitApi.startRecording(meetingId)
    if ('data' in res && res.data?.recording) {
      setIsRecording(true)
    }
  }

  // Stop recording (host only)
  const handleStopRecording = async () => {
    await livekitApi.stopRecording(meetingId)
    setIsRecording(false)
  }

  // End call
  const handleEndCall = async () => {
    const isLastParticipant = allParticipants.length <= 1
    if (isHost || isLastParticipant) {
      if (isRecording) await livekitApi.stopRecording(meetingId)
      await meetingsApi.end(meetingId)
    }
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
        <div className={styles.participantsList}>
          {allParticipants.map((p) => {
            const isSpeaking = p.isSpeaking
            const initials = p.name
              ? p.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
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
                    {p.name ?? p.identity}
                    {p.isLocal && ' (вы)'}
                  </div>
                  {p.identity === meeting.creatorId && (
                    <div className={styles.participantRole}>Организатор</div>
                  )}
                </div>
                <div className={styles.participantIcons}>
                  {isMuted
                    ? <MicOff size={14} className={styles.mutedIcon} />
                    : <Mic size={14} />
                  }
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
          <VideoConference />
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

          {/* Center: mic, cam, screen, end */}
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

            <button
              id="end-call-btn"
              className={styles.endCallBtn}
              onClick={() => setShowEndConfirm(true)}
              aria-label="Завершить звонок"
            >
              <PhoneOff size={18} />
              Завершить
            </button>
          </div>

          {/* Right: Senti */}
          <div className={styles.controlsRight}>
            {isHost && (
              <Tooltip label={showSenti ? 'Закрыть Senti' : 'Открыть Senti-протокол'}>
                <button
                  id="toggle-senti-btn"
                  className={`${styles.controlBtn} ${showSenti ? styles.sentiActive : ''}`}
                  onClick={() => setShowSenti((v) => !v)}
                  aria-label="Senti AI протокол"
                >
                  <Bot size={20} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* ── Senti Panel ── */}
      {showSenti && (
        <aside className={styles.sentiPanel}>
          <div className={styles.sentiHeader}>
            <div className={styles.sentiTitle}>
              <Bot size={18} color="var(--color-accent-amber)" />
              <span className="senti-text">Senti</span>
              <span className={styles.sentiBeta}>AI</span>
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
                    style={{ width: '100%', borderColor: 'rgba(255,183,3,0.3)', color: 'var(--color-accent-amber)' }}
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
      {showEndConfirm && (() => {
        const isLastParticipant = allParticipants.length <= 1
        const willEndCall = isHost || isLastParticipant
        return (
          <div className="modal-overlay" onClick={() => setShowEndConfirm(false)}>
            <div
              className={`modal-content ${styles.endCallModal}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.endCallIcon}>
                <PhoneOff size={24} />
              </div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>
                {willEndCall ? 'Завершить встречу?' : 'Покинуть встречу?'}
              </h3>
              <p style={{ marginBottom: 'var(--space-6)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {willEndCall
                  ? 'Встреча завершится и будет отмечена как выполненная. Senti сохранит протокол при наличии записи.'
                  : 'Вы покинете комнату. Встреча продолжится для остальных участников.'
                }
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setShowEndConfirm(false)}>
                  Отмена
                </button>
                <button
                  id="confirm-end-call-btn"
                  className="btn btn-danger"
                  onClick={handleEndCall}
                >
                  {willEndCall ? <PhoneOff size={16} /> : <LogOut size={16} />}
                  {willEndCall ? 'Завершить для всех' : 'Покинуть'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
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
