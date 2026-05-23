import type { FastifyPluginAsync } from 'fastify'
import '@fastify/multipart'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { pool } from '../db/pool.js'

const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(200),
})

// Helper: verify user is a participant of a meeting
async function assertParticipant(meetingId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM meetings m
     LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id AND mp.user_id = $2
     WHERE m.id = $1 AND (m.creator_id = $2 OR mp.user_id IS NOT NULL)`,
    [meetingId, userId],
  )
  return result.rows.length > 0
}

export const meetingsRoutes: FastifyPluginAsync = async (app) => {

  // All routes require auth
  app.addHook('onRequest', app.authenticate)

  // GET /api/meetings
  app.get('/', async (request, reply) => {
    const user = request.user as { sub: string }

    const result = await pool.query(
      `SELECT
         m.id, m.title, m.creator_id AS "creatorId", m.livekit_room AS "livekitRoom",
         m.created_at AS "createdAt", m.ended_at AS "endedAt",
         m.duration_sec AS "durationSec", m.is_recorded AS "isRecorded",
         m.senti_status AS "sentiStatus", m.summary,
         json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) AS creator,
         (
           SELECT json_agg(json_build_object(
             'userId', p.id, 'name', p.name, 'avatarUrl', p.avatar_url, 'joinedAt', mp2.joined_at
           ))
           FROM meeting_participants mp2
           JOIN users p ON p.id = mp2.user_id
           WHERE mp2.meeting_id = m.id
         ) AS participants
       FROM meetings m
       JOIN users u ON u.id = m.creator_id
       WHERE m.creator_id = $1
          OR m.id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = $1)
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [user.sub],
    )

    return reply.send({ data: result.rows })
  })

  // POST /api/meetings
  app.post('/', async (request, reply) => {
    const user = request.user as { sub: string; name: string }
    const body = CreateMeetingSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.message } })
    }

    const roomName = `centras-${randomUUID()}`
    const result = await pool.query(
      `INSERT INTO meetings (title, creator_id, livekit_room)
       VALUES ($1, $2, $3)
       RETURNING id, title, creator_id AS "creatorId", livekit_room AS "livekitRoom", created_at AS "createdAt", is_recorded AS "isRecorded", senti_status AS "sentiStatus"`,
      [body.data.title, user.sub, roomName],
    )

    const meeting = result.rows[0]

    // Auto-add creator as participant
    await pool.query(
      'INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [meeting.id, user.sub],
    )

    return reply.status(201).send({ data: meeting })
  })

  // GET /api/meetings/:id
  app.get('/:id', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const allowed = await assertParticipant(id, user.sub)
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }

    const result = await pool.query(
      `SELECT
         m.id, m.title, m.creator_id AS "creatorId", m.livekit_room AS "livekitRoom",
         m.created_at AS "createdAt", m.ended_at AS "endedAt",
         m.duration_sec AS "durationSec", m.is_recorded AS "isRecorded",
         m.senti_status AS "sentiStatus", m.summary,
         json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) AS creator,
         (
           SELECT json_agg(json_build_object(
             'userId', p.id, 'name', p.name, 'avatarUrl', p.avatar_url, 'joinedAt', mp.joined_at
           ))
           FROM meeting_participants mp
           JOIN users p ON p.id = mp.user_id
           WHERE mp.meeting_id = m.id
         ) AS participants
       FROM meetings m
       JOIN users u ON u.id = m.creator_id
       WHERE m.id = $1`,
      [id],
    )

    if (!result.rows[0]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } })
    }

    return reply.send({ data: result.rows[0] })
  })

  // POST /api/meetings/:id/join — record participant join
  app.post('/:id/join', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const meeting = await pool.query('SELECT id FROM meetings WHERE id = $1', [id])
    if (!meeting.rows[0]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } })
    }

    await pool.query(
      'INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, user.sub],
    )

    return reply.send({ data: { joined: true } })
  })

  // POST /api/meetings/:id/end — host or participant ends the meeting
  app.post('/:id/end', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const allowed = await assertParticipant(id, user.sub)
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }

    const meeting = await pool.query(
      'SELECT creator_id, created_at FROM meetings WHERE id = $1 AND ended_at IS NULL',
      [id],
    )

    if (!meeting.rows[0]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Active meeting not found' } })
    }

    const durationSec = Math.floor((Date.now() - new Date(meeting.rows[0].created_at).getTime()) / 1000)

    await pool.query(
      'UPDATE meetings SET ended_at = NOW(), duration_sec = $1 WHERE id = $2',
      [durationSec, id],
    )

    return reply.send({ data: { ended: true, durationSec } })
  })

  // GET /api/meetings/:id/transcript
  app.get('/:id/transcript', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const allowed = await assertParticipant(id, user.sub)
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }

    const result = await pool.query(
      `SELECT id, speaker_name AS "speakerName", phrase, start_sec AS "startSec", end_sec AS "endSec"
       FROM meeting_transcripts
       WHERE meeting_id = $1
       ORDER BY start_sec ASC`,
      [id],
    )

    return reply.send({ data: result.rows })
  })

  // GET /api/meetings/:id/search — full-text search in transcript
  app.get('/:id/search', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const { q } = request.query as { q?: string }

    if (!q || q.trim().length < 2) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 chars' } })
    }

    const allowed = await assertParticipant(id, user.sub)
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }

    const result = await pool.query(
      `SELECT id, speaker_name AS "speakerName", phrase, start_sec AS "startSec",
              ts_rank(phrase_tsv, query) AS rank
       FROM meeting_transcripts, plainto_tsquery('russian', $2) query
       WHERE meeting_id = $1 AND phrase_tsv @@ query
       ORDER BY rank DESC, start_sec ASC
       LIMIT 20`,
      [id, q],
    )

    return reply.send({ data: result.rows })
  })

  // POST /api/meetings/:id/upload — upload offline recording
  app.post('/:id/upload', async (request, reply) => {
    const user = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const allowed = await assertParticipant(id, user.sub)
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }

    const fileData = await request.file()
    if (!fileData) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } })
    }

    if (fileData.mimetype !== 'audio/mpeg' && fileData.mimetype !== 'audio/mp3' && !fileData.filename.endsWith('.mp3')) {
      return reply.status(400).send({ error: { code: 'INVALID_FORMAT', message: 'Only MP3 files are allowed' } })
    }

    const audioPath = `/data/audio/${id}.mp3`
    
    // Ensure directory exists
    const fs = await import('fs')
    const { pipeline } = await import('stream/promises')
    const { dirname } = await import('path')
    
    try {
      fs.mkdirSync(dirname(audioPath), { recursive: true })
      await pipeline(fileData.file, fs.createWriteStream(audioPath))
    } catch (err: any) {
      return reply.status(500).send({ error: { code: 'UPLOAD_FAILED', message: err.message } })
    }

    // Set meeting status to processing
    await pool.query(
      "UPDATE meetings SET senti_status = 'processing' WHERE id = $1",
      [id],
    )

    // Trigger AI pipeline (non-blocking)
    import('../services/gemini.js').then(({ runSentiPipeline }) => {
      runSentiPipeline(id, audioPath).catch((err) => {
        app.log.error({ err, meetingId: id }, 'Senti pipeline failed')
        pool.query("UPDATE meetings SET senti_status = 'failed' WHERE id = $1", [id])
      })
    })

    return reply.send({ data: { success: true, sentiStatus: 'processing' } })
  })
}
