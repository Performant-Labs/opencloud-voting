import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth.js'
import { features } from './routes/features.js'
import { votes } from './routes/votes.js'

const app = new Hono()

// CORS — allow requests from OpenCloud Web
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Opencloud-User'],
    credentials: true,
  })
)

// Auth — all API routes require a user identity
app.use('/api/*', authMiddleware)

// Mount routes
app.route('/api/features', features)
app.route('/api/features', votes)

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT) || 3456

console.log(`Voting API listening on port ${port}`)
serve({ fetch: app.fetch, port })

export { app }
