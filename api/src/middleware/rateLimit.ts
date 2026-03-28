import type { Context, Next } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Simple in-memory rate limiter.
 * Limits requests per user per window.
 *
 * @param maxRequests - Maximum requests per window (default 30)
 * @param windowMs - Window duration in ms (default 60000 = 1 minute)
 */
export function rateLimiter(maxRequests = 30, windowMs = 60_000) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = c.get('userId') as string | undefined
    const key = userId || c.req.header('x-forwarded-for') || 'anonymous'
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > maxRequests) {
      return c.json(
        { error: 'Too many requests. Try again later.' },
        429
      )
    }

    await next()
  }
}
