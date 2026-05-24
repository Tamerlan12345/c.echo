import { readFileSync, unlinkSync, existsSync } from 'fs'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { maskPII } from './masking.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// ─── Zod schema for Senti output validation ───────────────────────────────────

const SentiOutputSchema = z.object({
  diarization: z.array(z.object({
    speaker: z.string(),
    startSec: z.number(),
    endSec: z.number(),
    text: z.string(),
  })),
  summary: z.string().max(1000),
  decisions: z.array(z.object({
    id: z.number(),
    text: z.string(),
    initiator: z.string(),
    status: z.enum(['approved', 'rejected', 'pending']),
  })),
  tasks: z.array(z.object({
    id: z.number(),
    text: z.string(),
    assignee: z.string(),
    deadline: z.string().nullable(),
  })),
  keyMoments: z.array(z.object({
    sec: z.number(),
    label: z.string(),
  })),
})

type SentiOutput = z.infer<typeof SentiOutputSchema>

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runSentiPipeline(meetingId: string, audioPath: string): Promise<void> {
  // 1. Get participant names for speaker diarization hint
  const participantsResult = await pool.query(
    `SELECT u.name FROM meeting_participants mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.meeting_id = $1`,
    [meetingId],
  )
  const participantNames = participantsResult.rows.map((r) => r.name)

  // 2. Read audio file from Railway Volume
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`)
  }
  const audioBuffer = readFileSync(audioPath)
  const audioBase64 = audioBuffer.toString('base64')

  // 3. Mask PII in participant names before sending (extra precaution)
  const safeNames = participantNames.map(maskPII)

  // 4. Upload to Gemini Files API and run inference
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const systemPrompt = buildSentiPrompt(safeNames)
  let sentiOutput: SentiOutput | null = null
  let lastError: Error | null = null

  // Retry up to 3 times if JSON is malformed
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: audioBase64,
          },
        },
        systemPrompt,
      ])

      const rawText = result.response.text()

      // Extract JSON from response (Gemini sometimes wraps in markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in Gemini response')

      const parsed = JSON.parse(jsonMatch[0])
      sentiOutput = SentiOutputSchema.parse(parsed)
      break
    } catch (err) {
      lastError = err as Error
      console.warn(`Senti attempt ${attempt}/3 failed:`, lastError.message)
      await sleep(2000 * attempt)
    }
  }

  if (!sentiOutput) {
    throw new Error(`Senti pipeline failed after 3 attempts: ${lastError?.message}`)
  }

  // 5. Save transcript entries to DB
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const entry of sentiOutput.diarization) {
      await client.query(
        `INSERT INTO meeting_transcripts (meeting_id, speaker_name, phrase, start_sec, end_sec)
         VALUES ($1, $2, $3, $4, $5)`,
        [meetingId, entry.speaker, maskPII(entry.text), entry.startSec, entry.endSec],
      )
    }

    // Save summary JSON to meetings table
    const summary = {
      summary: sentiOutput.summary,
      decisions: sentiOutput.decisions,
      tasks: sentiOutput.tasks,
      keyMoments: sentiOutput.keyMoments,
    }

    await client.query(
      `UPDATE meetings SET summary = $1, senti_status = 'done' WHERE id = $2`,
      [JSON.stringify(summary), meetingId],
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // 6. Delete audio file immediately after processing (data retention policy)
  try {
    unlinkSync(audioPath)
  } catch {
    console.warn(`Could not delete audio file: ${audioPath}`)
  }
}

// ─── Senti system prompt ──────────────────────────────────────────────────────

function buildSentiPrompt(participantNames: string[]): string {
  const namesList = participantNames.join(', ')
  return `You are Senti, the corporate AI secretary for Centras.Echo.
Meeting participants: ${namesList}

Analyze the provided audio recording and return ONLY valid JSON (no markdown, no explanation):
{
  "diarization": [
    {"speaker": "Exact Name from participants list", "startSec": 0, "endSec": 45, "text": "exact quote"}
  ],
  "summary": "2-3 sentence executive summary in Russian",
  "decisions": [
    {"id": 1, "text": "decision text", "initiator": "Speaker Name", "status": "approved|rejected|pending"}
  ],
  "tasks": [
    {"id": 1, "text": "task description", "assignee": "Speaker Name", "deadline": "YYYY-MM-DD or null"}
  ],
  "keyMoments": [
    {"sec": 120, "label": "Brief label for this moment"}
  ]
}

RULES:
- No hallucinations. Quote EXACTLY what was said.
- Match speaker names to the provided participant list by voice.
- If unsure about a speaker, use "Unknown Speaker 1", "Unknown Speaker 2" etc.
- All text fields (phrases, decisions, tasks) must be in the original language spoken.
- Summary must be in Russian.
- Return ONLY the JSON object. No markdown code blocks. No explanation text.`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
