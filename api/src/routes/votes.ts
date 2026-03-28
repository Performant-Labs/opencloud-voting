import { Hono } from 'hono'
import { getDb } from '../db.js'

type Env = { Variables: { userId: string } }

const votes = new Hono<Env>()

/**
 * POST /api/features/:id/vote — Toggle vote on a feature.
 *
 * If the user has already voted, the vote is removed (un-vote).
 * If the user has not voted, a vote is added.
 * Returns { voted: boolean, voteCount: number }.
 */
votes.post('/:id/vote', (c) => {
  const userId = c.get('userId') as string
  const featureId = Number(c.req.param('id'))
  const db = getDb()

  // Check feature exists
  const feature = db
    .prepare('SELECT id FROM features WHERE id = ?')
    .get(featureId) as { id: number } | undefined

  if (!feature) {
    return c.json({ error: 'Feature not found' }, 404)
  }

  // Use a transaction for atomicity
  const toggleVote = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM votes WHERE feature_id = ? AND user_id = ?')
      .get(featureId, userId) as { id: number } | undefined

    if (existing) {
      // Un-vote
      db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id)
      db.prepare(
        'UPDATE features SET vote_count = MAX(0, vote_count - 1) WHERE id = ?'
      ).run(featureId)
      return false
    } else {
      // Vote
      db.prepare(
        'INSERT INTO votes (feature_id, user_id) VALUES (?, ?)'
      ).run(featureId, userId)
      db.prepare(
        'UPDATE features SET vote_count = vote_count + 1 WHERE id = ?'
      ).run(featureId)
      return true
    }
  })

  const voted = toggleVote()

  const updated = db
    .prepare('SELECT vote_count FROM features WHERE id = ?')
    .get(featureId) as { vote_count: number }

  return c.json({ voted, voteCount: updated.vote_count })
})

export { votes }
