import type { Context, Next } from 'hono'

/**
 * Auth middleware: extracts user identity from trusted proxy header.
 *
 * In the DDEV/Docker environment, OpenCloud's reverse proxy forwards
 * the authenticated user via the X-Access-Token or we parse
 * the Authorization header. For MVP we use a simple trusted header.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Try trusted proxy header first (set by OpenCloud reverse proxy)
  let userId = c.req.header('X-Opencloud-User')

  // Fall back to basic auth for development/testing
  if (!userId) {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Basic ')) {
      const decoded = atob(authHeader.slice(6))
      userId = decoded.split(':')[0]
    }
  }

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', userId)
  await next()
}
