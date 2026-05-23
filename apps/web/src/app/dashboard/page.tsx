'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { meetingsApi, authApi, adminApi } from '@/lib/api'
import type { Meeting, User } from '@centras/shared'
import styles from './dashboard.module.css'
import {
  Video, Plus, Archive, Settings, LogOut, Users,
  Clock, Shield, ChevronRight, Zap
} from 'lucide-react'

const MAX_ACTIVE = 5
const MAX_PER_ROOM = 7

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [meRes, meetRes] = await Promise.all([authApi.me(), meetingsApi.list()])
    if ('data' in meRes) setUser(meRes.data ?? null)
    if ('data' in meetRes) setMeetings(meetRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const activeMeetings = meetings.filter((m) => !m.endedAt)
  const pastMeetings = meetings.filter((m) => m.endedAt)
  const canCreate = activeMeetings.length < MAX_ACTIVE

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !canCreate) return
    setCreating(true)

    const res = await meetingsApi.create(newTitle.trim())
    if ('data' in res) {
      setShowCreate(false)
      setNewTitle('')
      router.push(`/room/${res.data!.id}`)
    }
    setCreating(false)
  }

  const formatDuration = (sec?: number) => {
    if (!sec) return '—'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatDate = (iso: string) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  }

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

  if (loading) return <DashboardSkeleton />

  return (
    <div className={`${styles.layout} fade-up`}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <LogoIcon />
        </div>

        <nav className={styles.sidebarNav}>
          <SidebarItem icon={<Video size={20} />} label="Встречи" active href="/dashboard" />
          <SidebarItem icon={<Archive size={20} />} label="Архив" href="/archive" />
          {user?.role === 'admin' && (
            <SidebarItem icon={<Users size={20} />} label="Пользователи" href="/admin" />
          )}
          <SidebarItem icon={<Settings size={20} />} label="Настройки" href="/settings" />
        </nav>

        <div className={styles.sidebarUser}>
          <div className="avatar avatar-sm" title={user?.name}>
            {initials(user?.name ?? 'U')}
          </div>
          <button
            className={styles.logoutBtn}
            onClick={authApi.logout}
            title="Выйти"
            aria-label="Выйти из системы"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.greeting}>
              Привет, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className={styles.date}>
              {new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            </p>
          </div>

          <button
            id="create-meeting-btn"
            className={`btn btn-primary ${!canCreate ? 'disabled' : ''}`}
            onClick={() => setShowCreate(true)}
            disabled={!canCreate}
            title={!canCreate ? `Достигнут лимит ${MAX_ACTIVE} встреч` : ''}
          >
            <Plus size={18} />
            Новая встреча
          </button>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <StatCard
            icon={<Video size={20} />}
            label="Активных встреч"
            value={`${activeMeetings.length} / ${MAX_ACTIVE}`}
            accent="blue"
          />
          <StatCard
            icon={<Users size={20} />}
            label="Участников макс."
            value={String(MAX_PER_ROOM)}
            accent="blue"
          />
          <StatCard
            icon={<Archive size={20} />}
            label="Всего встреч"
            value={String(meetings.length)}
            accent="amber"
          />
          <StatCard
            icon={<Shield size={20} />}
            label="С протоколом Senti"
            value={String(meetings.filter((m) => m.sentiStatus === 'done').length)}
            accent="amber"
          />
        </div>

        {/* Active meetings */}
        {activeMeetings.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Активные встречи</h2>
              <div className={styles.liveIndicator}>
                <span className="live-dot" aria-hidden="true" />
                <span>Live</span>
              </div>
            </div>

            <div className={styles.meetingsGrid}>
              {activeMeetings.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  isActive
                  onJoin={() => router.push(`/room/${m.id}`)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past meetings */}
        {pastMeetings.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Прошедшие встречи</h2>
              <a href="/archive" className={styles.viewAll}>
                Все <ChevronRight size={14} />
              </a>
            </div>

            <div className={styles.meetingsList}>
              {pastMeetings.slice(0, 5).map((m) => (
                <PastMeetingRow
                  key={m.id}
                  meeting={m}
                  onClick={() => router.push(`/archive/${m.id}`)}
                  formatDate={formatDate}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          </section>
        )}

        {meetings.length === 0 && (
          <EmptyState onCreate={() => setShowCreate(true)} />
        )}
      </main>

      {/* Create meeting modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Новая встреча</h3>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label className={styles.label} htmlFor="meeting-title">
                  Название встречи
                </label>
                <input
                  id="meeting-title"
                  className="input-field"
                  type="text"
                  placeholder="Еженедельный синк команды"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  maxLength={200}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                  Отмена
                </button>
                <button
                  id="confirm-create-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={!newTitle.trim() || creating}
                >
                  {creating ? 'Создание...' : 'Создать и войти'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string; accent: 'blue' | 'amber'
}) {
  return (
    <div className={`${styles.statCard} ${styles[`statCard_${accent}`]}`}>
      <div className={`${styles.statIcon} ${styles[`statIcon_${accent}`]}`}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

function MeetingCard({ meeting, isActive, onJoin, formatDate }: {
  meeting: Meeting; isActive: boolean; onJoin: () => void; formatDate: (s: string) => string
}) {
  const count = meeting.participants?.length ?? 0
  return (
    <div className={styles.meetingCard}>
      <div className={styles.meetingCardTop}>
        <span className="badge badge-green">
          <span className="live-dot" style={{ width: 6, height: 6 }} aria-hidden="true" />
          Активна
        </span>
        <span className={styles.participantCount}>
          <Users size={12} />
          {count} / {MAX_PER_ROOM}
        </span>
      </div>
      <h3 className={styles.meetingTitle}>{meeting.title}</h3>
      <p className={styles.meetingMeta}>
        <Clock size={12} /> {formatDate(meeting.createdAt)}
      </p>
      <button id={`join-meeting-${meeting.id}`} className="btn btn-primary" onClick={onJoin} style={{ width: '100%', marginTop: 'auto' }}>
        <Zap size={16} /> Войти
      </button>
    </div>
  )
}

function PastMeetingRow({ meeting, onClick, formatDate, formatDuration }: {
  meeting: Meeting; onClick: () => void; formatDate: (s: string) => string; formatDuration: (s?: number) => string
}) {
  return (
    <button className={styles.pastRow} onClick={onClick}>
      <div className={styles.pastRowIcon}>
        {meeting.sentiStatus === 'done'
          ? <span className="badge badge-amber" style={{ fontSize: 10 }}>Senti</span>
          : <Archive size={14} color="var(--color-text-muted)" />
        }
      </div>
      <div className={styles.pastRowContent}>
        <span className={styles.pastRowTitle}>{meeting.title}</span>
        <span className={styles.pastRowMeta}>{formatDate(meeting.createdAt)}</span>
      </div>
      <div className={styles.pastRowDuration}>
        <Clock size={12} />
        {formatDuration(meeting.durationSec)}
      </div>
      <ChevronRight size={16} color="var(--color-text-muted)" />
    </button>
  )
}

function SidebarItem({ icon, label, active, href }: {
  icon: React.ReactNode; label: string; active?: boolean; href: string
}) {
  return (
    <a
      href={href}
      className={`${styles.sidebarItem} ${active ? styles.sidebarItemActive : ''}`}
      title={label}
      aria-label={label}
    >
      {icon}
      <span className={styles.sidebarItemLabel}>{label}</span>
    </a>
  )
}

function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-label="Centras.Echo">
      <defs>
        <linearGradient id="dashLogoGrad" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="#E50012"/>
          <stop offset="50%" stopColor="#8A005A"/>
          <stop offset="100%" stopColor="#0033A0"/>
        </linearGradient>
      </defs>
      <rect x="2" y="10" width="18" height="16" rx="4" fill="url(#dashLogoGrad)"/>
      <path d="M20 14L27 10V26L20 22V14Z" fill="url(#dashLogoGrad)"/>
      <path d="M31 13C32.5 15 32.5 21 31 23" stroke="url(#dashLogoGrad)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}><Video size={40} color="var(--color-text-muted)" /></div>
      <h3>Нет встреч</h3>
      <p>Создайте первую встречу и пригласите коллег</p>
      <button className="btn btn-primary" onClick={onCreate}><Plus size={16} />Создать встречу</button>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {[1,2,3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 80, marginBottom: 16, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  )
}
