import type { Context, Next } from 'hono'

const MAX_TITLE_LENGTH = 255
const MAX_DESCRIPTION_LENGTH = 2000

/**
 * Strip HTML tags and trim whitespace from a string.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim()
}

/**
 * Sanitize middleware for feature creation.
 * Strips HTML from title and description, enforces max lengths.
 */
export async function sanitizeInput(c: Context, next: Next): Promise<Response | void> {
  if (c.req.method === 'POST' && c.req.header('Content-Type')?.includes('application/json')) {
    try {
      const body = await c.req.json<{ title?: string; description?: string }>()
      if (body.title) {
        body.title = stripHtml(body.title).slice(0, MAX_TITLE_LENGTH)
      }
      if (body.description) {
        body.description = stripHtml(body.description).slice(0, MAX_DESCRIPTION_LENGTH)
      }
      // Store sanitized body for downstream handlers
      c.set('sanitizedBody', body)
    } catch {
      // Not valid JSON — let the route handler deal with it
    }
  }
  await next()
}
