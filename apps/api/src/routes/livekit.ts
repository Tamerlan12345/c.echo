import type { FastifyPluginAsync } from 'fastify'
import { AccessToken, RoomServiceClient, EgressClient } from 'livekit-server-sdk'
import type { EncodedFileOutput } from 'livekit-server-sdk'
import fs from 'fs'
import path from 'path'
import { pool } from '../db/pool.js'
import { getActiveCount, getParticipantCount, MAX_PARTICIPANTS_PER_MEETING, MAX_ACTIVE_MEETINGS } from '../services/limits.js'

const getLiveKitUrl = (): string => {
  const url = process.env.LIVEKIT_URL || ''
  if (url.includes('.internal') && process.env.PUBLIC_LIVEKIT_URL) {
    return process.env.PUBLIC_LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://')
  }
  return url
}

const getLiveKitClient = () => new RoomServiceClient(
  getLiveKitUrl(),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
)

const getEgressClient = () => new EgressClient(
  getLiveKitUrl(),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
)

const getPublicLiveKitUrl = (): string => {
  if (process.env.PUBLIC_LIVEKIT_URL) {
    return process.env.PUBLIC_LIVEKIT_URL
  }

  const livekitUrl = process.env.LIVEKIT_URL || ''
  if (
    livekitUrl &&
    !livekitUrl.includes('localhost') &&
    !livekitUrl.includes('127.0.0.1') &&
    !livekitUrl.includes('.internal') &&
    (livekitUrl.startsWith('wss://') || livekitUrl.startsWith('ws://'))
  ) {
    return livekitUrl
  }

  const frontendUrl = process.env.FRONTEND_URL || ''
  if (frontendUrl && !frontendUrl.includes('localhost') && !frontendUrl.includes('127.0.0.1')) {
    try {
      const url = new URL(frontendUrl)
      return `wss://livekit.${url.hostname}`
    } catch {
      // ignore
    }
  }

  return livekitUrl || 'ws://localhost:7880'
}

export const livekitRoutes: FastifyPluginAsync = async (app) => {

  app.addHook('onRequest', app.authenticate)

  // POST /api/livekit/token — generate participant token
  app.post('/token', async (request, reply) => {
    const user = request.user as { sub: string; name: string; email: string }
    const { meetingId } = request.body as { meetingId: string }

    if (!meetingId) {
      return reply.status(400).send({ error: { code: 'MISSING_MEETING_ID', message: 'meetingId required' } })
    }

    // Load meeting
    const meetingResult = await pool.query(
      'SELECT id, livekit_room, ended_at FROM meetings WHERE id = $1',
      [meetingId],
    )
    const meeting = meetingResult.rows[0]
    if (!meeting) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } })
    }
    if (meeting.ended_at) {
      return reply.status(400).send({ error: { code: 'MEETING_ENDED', message: 'Meeting has ended' } })
    }

    // Enforce participant limit
    const count = await getParticipantCount(meetingId)
    if (count >= MAX_PARTICIPANTS_PER_MEETING) {
      return reply.status(429).send({
        error: { code: 'ROOM_FULL', message: `Максимум ${MAX_PARTICIPANTS_PER_MEETING} участников` },
      })
    }

    // Enforce global active meetings limit (on join, not create)
    const activeCount = await getActiveCount()
    if (activeCount > MAX_ACTIVE_MEETINGS) {
      return reply.status(429).send({
        error: { code: 'TOO_MANY_MEETINGS', message: `Максимум ${MAX_ACTIVE_MEETINGS} одновременных встреч` },
      })
    }

    // Build LiveKit access token
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      {
        identity: user.sub,
        name: user.name,
        ttl: '2h',
      },
    )

    at.addGrant({
      room: meeting.livekit_room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await at.toJwt()

    // Record join in participants table
    await pool.query(
      'INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [meetingId, user.sub],
    )

    return reply.send({
      data: {
        token,
        serverUrl: getPublicLiveKitUrl(),
      },
    })
  })

  // POST /api/livekit/egress/start — start audio recording (host only)
  app.post('/egress/start', async (request, reply) => {
    const user = request.user as { sub: string }
    const { meetingId } = request.body as { meetingId: string }

    // Check host
    const meeting = await pool.query(
      'SELECT creator_id, livekit_room, is_recorded FROM meetings WHERE id = $1',
      [meetingId],
    )
    if (!meeting.rows[0]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } })
    }
    if (meeting.rows[0].creator_id !== user.sub) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only host can start recording' } })
    }
    if (meeting.rows[0].is_recorded) {
      return reply.status(400).send({ error: { code: 'ALREADY_RECORDING', message: 'Recording already started' } })
    }

    // Verify all participants consented
    const consentCheck = await pool.query(
      `SELECT
         COUNT(DISTINCT mp.user_id) AS total,
         COUNT(DISTINCT mc.user_id) AS consented
       FROM meeting_participants mp
       LEFT JOIN meeting_consents mc
         ON mc.meeting_id = mp.meeting_id AND mc.user_id = mp.user_id
       WHERE mp.meeting_id = $1`,
      [meetingId],
    )
    const { total, consented } = consentCheck.rows[0]
    if (Number(total) !== Number(consented)) {
      return reply.status(403).send({
        error: {
          code: 'CONSENT_INCOMPLETE',
          message: `Ожидается согласие: ${consented}/${total} участников`,
        },
      })
    }

    // Start LiveKit Egress — composite audio file to Railway Volume
    const client = getEgressClient()
    const outputPath = `/data/audio/${meetingId}.mp3`

    try {
      const egress = await client.startRoomCompositeEgress(meeting.rows[0].livekit_room, {
        file: {
          filepath: outputPath,
          fileType: 4, // MP3
        } as any,
      })

      // Store egress ID for later stop
      await pool.query(
        `UPDATE meetings
         SET is_recorded = TRUE, egress_id = $1
         WHERE id = $2`,
        [egress.egressId, meetingId],
      )

      return reply.send({ data: { recording: true, egressId: egress.egressId } })
    } catch (err: any) {
      app.log.error({ err, meetingId }, `Failed to start LiveKit egress: ${err.message} - ${err.stack}`)
      return reply.status(500).send({
        error: {
          code: 'EGRESS_START_FAILED',
          message: err.message || 'Не удалось запустить службу записи LiveKit. Проверьте подключение Redis на сервере LiveKit.',
        },
      })
    }
  })

  // POST /api/livekit/egress/stop — stop recording + trigger Senti pipeline
  app.post('/egress/stop', async (request, reply) => {
    const user = request.user as { sub: string }
    const { meetingId } = request.body as { meetingId: string }

    const meeting = await pool.query(
      'SELECT creator_id, livekit_room, egress_id FROM meetings WHERE id = $1',
      [meetingId],
    )
    if (!meeting.rows[0]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } })
    }
    if (meeting.rows[0].creator_id !== user.sub) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only host can stop recording' } })
    }

    const egressId = meeting.rows[0].egress_id
    if (!egressId) {
      return reply.status(400).send({ error: { code: 'NO_RECORDING', message: 'No active recording found' } })
    }

    try {
      const client = getEgressClient()
      await client.stopEgress(egressId)
    } catch (err: any) {
      app.log.error({ err, egressId }, `Failed to stop LiveKit egress: ${err.message} - ${err.stack}`)
      return reply.status(500).send({
        error: {
          code: 'EGRESS_STOP_FAILED',
          message: err.message || 'Failed to stop LiveKit egress',
        },
      })
    }

    // Mark as processing — Senti pipeline starts async
    await pool.query(
      "UPDATE meetings SET senti_status = 'processing' WHERE id = $1",
      [meetingId],
    )

    // Trigger AI pipeline (non-blocking)
    const audioPath = `/data/audio/${meetingId}.mp3`

    // Import and run pipeline asynchronously
    import('../services/gemini.js').then(({ runSentiPipeline }) => {
      runSentiPipeline(meetingId, audioPath).catch((err) => {
        app.log.error({ err, meetingId }, 'Senti pipeline failed')
        pool.query("UPDATE meetings SET senti_status = 'failed' WHERE id = $1", [meetingId])
      })
    })

    return reply.send({ data: { stopped: true, sentiStatus: 'processing' } })
  })
}
