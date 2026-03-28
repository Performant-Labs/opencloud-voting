import { Hono } from 'hono'
import { getDb } from '../db.js'

const features = new Hono()

/** GET /api/features — List all features + current user's voted IDs */
features.get('/', (c) => {
  const userId = c.get('userId') as string
  const db = getDb()

  const allFeatures = db
    .prepare(
      `SELECT id, title, description, user_id as userId, vote_count as voteCount, created_at as createdAt
       FROM features ORDER BY vote_count DESC, created_at DESC`
    )
    .all()

  const votedRows = db
    .prepare('SELECT feature_id FROM votes WHERE user_id = ?')
    .all(userId) as { feature_id: number }[]

  const votedIds = votedRows.map((r) => r.feature_id)

  return c.json({ features: allFeatures, votedIds })
})

/** POST /api/features — Create a new feature */
features.post('/', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json<{ title?: string; description?: string }>()

  const title = body.title?.trim()
  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const description = body.description?.trim() || ''
  const db = getDb()

  const result = db
    .prepare(
      'INSERT INTO features (title, description, user_id) VALUES (?, ?, ?)'
    )
    .run(title, description, userId)

  const feature = db
    .prepare(
      `SELECT id, title, description, user_id as userId, vote_count as voteCount, created_at as createdAt
       FROM features WHERE id = ?`
    )
    .get(result.lastInsertRowid)

  return c.json(feature, 201)
})

/** DELETE /api/features/:id — Delete a feature (owner only) */
features.delete('/:id', (c) => {
  const userId = c.get('userId') as string
  const featureId = Number(c.req.param('id'))
  const db = getDb()

  const feature = db
    .prepare('SELECT user_id FROM features WHERE id = ?')
    .get(featureId) as { user_id: string } | undefined

  if (!feature) {
    return c.json({ error: 'Feature not found' }, 404)
  }

  if (feature.user_id !== userId) {
    return c.json({ error: 'Not allowed' }, 403)
  }

  // CASCADE will handle vote cleanup
  db.prepare('DELETE FROM features WHERE id = ?').run(featureId)

  return c.json({ success: true })
})

export { features }
