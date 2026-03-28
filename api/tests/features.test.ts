import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { getDb, closeDb } from '../src/db.js'
import { features } from '../src/routes/features.js'

type Env = { Variables: { userId: string } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTestApp(): Hono<any> {
  const app = new Hono<Env>()
  // Mock auth by setting userId directly
  app.use('/*', async (c, next) => {
    c.set('userId', 'test-user')
    await next()
  })
  app.route('/features', features as any)
  return app
}

describe('Features API', () => {
  let app: Hono<any>

  beforeEach(() => {
    process.env.DB_PATH = ':memory:'
    closeDb()
    app = createTestApp()
    // Initialize the DB
    getDb()
  })

  afterEach(() => {
    closeDb()
  })

  it('should list features (empty)', async () => {
    const res = await app.request('/features')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.features).toEqual([])
    expect(data.votedIds).toEqual([])
  })

  it('should create a feature', async () => {
    const res = await app.request('/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dark mode', description: 'Add dark theme' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.title).toBe('Dark mode')
    expect(data.description).toBe('Add dark theme')
    expect(data.userId).toBe('test-user')
    expect(data.voteCount).toBe(0)
  })

  it('should reject empty title', async () => {
    const res = await app.request('/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('should delete own feature', async () => {
    // Create first
    await app.request('/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To delete' }),
    })

    // List to get ID
    const listRes = await app.request('/features')
    const listData = await listRes.json()
    const id = listData.features[0].id

    // Delete
    const delRes = await app.request(`/features/${id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(200)

    // Verify gone
    const afterRes = await app.request('/features')
    const afterData = await afterRes.json()
    expect(afterData.features).toHaveLength(0)
  })

  it('should reject deletion by non-owner', async () => {
    // Create as test-user
    await app.request('/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Protected' }),
    })

    const listRes = await app.request('/features')
    const listData = await listRes.json()
    const id = listData.features[0].id

    // Try to delete as different user
    const otherApp = new Hono<Env>()
    otherApp.use('/*', async (c, next) => {
      c.set('userId', 'other-user')
      await next()
    })
    otherApp.route('/features', features as any)

    const delRes = await otherApp.request(`/features/${id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(403)
  })

  it('should paginate results', async () => {
    // Create 3 features
    for (const title of ['Feature A', 'Feature B', 'Feature C']) {
      await app.request('/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    }

    // Fetch page 1 (limit=2)
    const page1Res = await app.request('/features?limit=2&offset=0')
    const page1 = await page1Res.json()
    expect(page1.features).toHaveLength(2)
    expect(page1.total).toBe(3)
    expect(page1.limit).toBe(2)
    expect(page1.offset).toBe(0)

    // Fetch page 2
    const page2Res = await app.request('/features?limit=2&offset=2')
    const page2 = await page2Res.json()
    expect(page2.features).toHaveLength(1)
    expect(page2.total).toBe(3)
  })

  it('should cap limit at 100', async () => {
    const res = await app.request('/features?limit=999')
    const data = await res.json()
    expect(data.limit).toBe(100)
  })
})
