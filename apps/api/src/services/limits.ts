import type { FastifyPluginAsync } from 'fastify'
import { pool } from '../db/pool.js'
import type { User } from '@centras/shared'

// Constants enforced at API level
export const MAX_PARTICIPANTS_PER_MEETING = 7
export const MAX_ACTIVE_MEETINGS = 5

export const limitsRoutes: FastifyPluginAsync = async (app) => {

  // Checks used by meetings routes
  app.decorate('checkMeetingLimits', async (meetingId: string, userId: string) => {
    // 1. Check participant count for this meeting
    const participantCount = await pool.query(
      'SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1',
      [meetingId],
    )
    if (Number(participantCount.rows[0].count) >= MAX_PARTICIPANTS_PER_MEETING) {
      return { allowed: false, reason: `Максимум ${MAX_PARTICIPANTS_PER_MEETING} участников на встречу` }
    }

    // 2. Check active meetings count
    const activeCount = await pool.query(
      "SELECT COUNT(*) FROM meetings WHERE ended_at IS NULL AND creator_id = $1",
      [userId],
    )
    if (Number(activeCount.rows[0].count) >= MAX_ACTIVE_MEETINGS) {
      return { allowed: false, reason: `Максимум ${MAX_ACTIVE_MEETINGS} активных встреч одновременно` }
    }

    return { allowed: true, reason: null }
  })
}

// System-wide active meetings check (for global limit)
export async function getActiveCount(): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) FROM meetings WHERE ended_at IS NULL",
  )
  return Number(result.rows[0].count)
}

export async function getParticipantCount(meetingId: string): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1',
    [meetingId],
  )
  return Number(result.rows[0].count)
}
