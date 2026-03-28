import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { getDb, closeDb } from '../src/db.js'
import { features } from '../src/routes/features.js'
import { votes } from '../src/routes/votes.js'

type Env = { Variables: { userId: string } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTestApp(userId: string = 'test-user'): Hono<any> {
  const app = new Hono<Env>()
  app.use('/*', async (c, next) => {
    c.set('userId', userId)
    await next()
  })
  app.route('/api/features', features as any)
  app.route('/api/features', votes as any)
  return app
}

async function createFeature(app: Hono<any>, title: string): Promise<number> {
  const res = await app.request('/api/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const data = await res.json()
  return data.id
}

describe('Votes API', () => {
  let app: Hono<any>

  beforeEach(() => {
    process.env.DB_PATH = ':memory:'
    closeDb()
    app = createTestApp()
    getDb()
  })

  afterEach(() => {
    closeDb()
  })

  it('should toggle vote on', async () => {
    const featureId = await createFeature(app, 'Vote me')

    const res = await app.request(`/api/features/${featureId}/vote`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.voted).toBe(true)
    expect(data.voteCount).toBe(1)
  })

  it('should toggle vote off', async () => {
    const featureId = await createFeature(app, 'Toggle me')

    // Vote on
    await app.request(`/api/features/${featureId}/vote`, { method: 'POST' })

    // Vote off
    const res = await app.request(`/api/features/${featureId}/vote`, { method: 'POST' })
    const data = await res.json()
    expect(data.voted).toBe(false)
    expect(data.voteCount).toBe(0)
  })

  it('should track voted IDs in feature list', async () => {
    const featureId = await createFeature(app, 'Tracked')

    await app.request(`/api/features/${featureId}/vote`, { method: 'POST' })

    const listRes = await app.request('/api/features')
    const listData = await listRes.json()
    expect(listData.votedIds).toContain(featureId)
  })

  it('should return 404 for non-existent feature', async () => {
    const res = await app.request('/api/features/9999/vote', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('should cascade delete votes when feature is deleted', async () => {
    const featureId = await createFeature(app, 'Cascade test')

    // Vote on it
    await app.request(`/api/features/${featureId}/vote`, { method: 'POST' })

    // Delete the feature
    await app.request(`/api/features/${featureId}`, { method: 'DELETE' })

    // Verify votes table is clean
    const db = getDb()
    const remaining = db
      .prepare('SELECT COUNT(*) as count FROM votes WHERE feature_id = ?')
      .get(featureId) as { count: number }
    expect(remaining.count).toBe(0)
  })
})
