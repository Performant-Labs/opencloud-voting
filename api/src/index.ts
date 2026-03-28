import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth.js'
import { features } from './routes/features.js'
import { votes } from './routes/votes.js'

const app = new Hono()

// CORS — allow requests from OpenCloud Web
app.use(
  '/*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Access-Token'],
    credentials: true,
  })
)

// Auth — all /features routes require a user identity
app.use('/features/*', authMiddleware)
app.use('/features', authMiddleware)

// Mount routes at root level.
// When deployed behind the OpenCloud proxy, the proxy routes
// /api/voting/features → http://voting-api:3456/features
// (the proxy strips the /api/voting prefix automatically).
app.route('/features', features)
app.route('/features', votes)

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT) || 3456

console.log(`Voting API listening on port ${port}`)
serve({ fetch: app.fetch, port })

export { app }
