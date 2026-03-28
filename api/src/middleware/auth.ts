import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose'

/**
 * Auth middleware: extracts user identity from request.
 *
 * In production (behind OpenCloud proxy):
 *   The proxy validates the OIDC token and forwards the JWT via
 *   X-Access-Token header. We decode it to extract the user identity
 *   from the `preferred_username` or `sub` claim.
 *
 *   If OIDC_ISSUER is set, we also validate the JWT signature against
 *   the issuer's JWKS endpoint. Otherwise we trust the proxy did the
 *   validation (since the sidecar is not exposed externally).
 *
 * In development (standalone, no proxy):
 *   Falls back to Basic Auth or Authorization: Bearer header.
 *   Only available when NODE_ENV !== 'production'.
 */

// Lazy-initialized JWKS client for signature verification
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS(): ReturnType<typeof createRemoteJWKSet> | null {
  const issuer = process.env.OIDC_ISSUER
  if (!issuer) return null

  if (!jwks) {
    const jwksUrl = new URL('/.well-known/openid-configuration/jwks', issuer)
    jwks = createRemoteJWKSet(jwksUrl)
  }
  return jwks
}

/**
 * Extract username from JWT claims.
 * Tries preferred_username first (standard OIDC), falls back to sub.
 */
function extractUserId(payload: JWTPayload): string | undefined {
  return (
    (payload.preferred_username as string) ||
    (payload.sub as string) ||
    undefined
  )
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  let userId: string | undefined

  // 1. Try X-Access-Token (set by OpenCloud proxy)
  const xAccessToken = c.req.header('X-Access-Token')
  if (xAccessToken) {
    try {
      const keySet = getJWKS()
      if (keySet) {
        // Full verification: signature + claims
        const { payload } = await jwtVerify(xAccessToken, keySet)
        userId = extractUserId(payload)
      } else {
        // Trust the proxy — just decode without signature verification
        const payload = decodeJwt(xAccessToken)
        userId = extractUserId(payload)
      }
    } catch (err) {
      console.error('JWT verification failed:', (err as Error).message)
      return c.json({ error: 'Invalid access token' }, 401)
    }
  }

  // 2. Try Authorization: Bearer (from web extension fetch)
  if (!userId) {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const keySet = getJWKS()
        if (keySet) {
          const { payload } = await jwtVerify(token, keySet)
          userId = extractUserId(payload)
        } else {
          const payload = decodeJwt(token)
          userId = extractUserId(payload)
        }
      } catch (err) {
        console.error('Bearer token verification failed:', (err as Error).message)
        return c.json({ error: 'Invalid bearer token' }, 401)
      }
    }
  }

  // 3. Dev-only: Basic Auth fallback
  if (!userId && process.env.NODE_ENV !== 'production') {
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
