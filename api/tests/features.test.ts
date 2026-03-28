import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { getDb, closeDb } from '../src/db.js'
import { features } from '../src/routes/features.js'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

// Use an in-memory test database
const TEST_DB_PATH = path.join(import.meta.dirname || '.', 'test-features.db')

function createTestApp() {
  const app = new Hono()
  // Mock auth by setting userId directly
  app.use('/*', async (c, next) => {
    c.set('userId', 'test-user')
    await next()
  })
  app.route('/api/features', features)
  return app
}

describe('Features API', () => {
  let app: Hono

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
    const res = await app.request('/api/features')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.features).toEqual([])
    expect(data.votedIds).toEqual([])
  })

  it('should create a feature', async () => {
    const res = await app.request('/api/features', {
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
    const res = await app.request('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('should delete own feature', async () => {
    // Create first
    await app.request('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To delete' }),
    })

    // List to get ID
    const listRes = await app.request('/api/features')
    const listData = await listRes.json()
    const id = listData.features[0].id

    // Delete
    const delRes = await app.request(`/api/features/${id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(200)

    // Verify gone
    const afterRes = await app.request('/api/features')
    const afterData = await afterRes.json()
    expect(afterData.features).toHaveLength(0)
  })

  it('should reject deletion by non-owner', async () => {
    // Create as test-user
    await app.request('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Protected' }),
    })

    const listRes = await app.request('/api/features')
    const listData = await listRes.json()
    const id = listData.features[0].id

    // Try to delete as different user
    const otherApp = new Hono()
    otherApp.use('/*', async (c, next) => {
      c.set('userId', 'other-user')
      await next()
    })
    otherApp.route('/api/features', features)

    const delRes = await otherApp.request(`/api/features/${id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(403)
  })
})
