import { ref, computed } from 'vue'
import type { Feature, FeatureListResponse, ErrorResponse } from '../types'

/**
 * Composable for the voting API using the Go sidecar backend.
 *
 * All requests go through the OpenCloud proxy at /api/voting/*,
 * which forwards them to the voting-app container with the
 * authenticated user's OIDC Bearer token.
 *
 * This replaces the previous WebDAV-based storage approach.
 * No direct fetch() calls — all requests use the authenticated
 * helper that injects the Bearer token from the OpenCloud auth store.
 */

export function useVotingApi(options?: {
  accessToken?: () => string | undefined
}) {
  const getToken = options?.accessToken

  const features = ref<Feature[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const total = computed(() => features.value.length)

  // Current user ID extracted from the OIDC token
  const currentUserId = ref('')

  /**
   * Decode the JWT to extract the `sub` claim for local voted tracking.
   * The server already validated the token — we only need the subject
   * for UI state (highlighting the user's own votes).
   */
  function getUserId(): string {
    if (currentUserId.value) return currentUserId.value
    const token = getToken?.()
    if (!token) return ''
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      currentUserId.value = payload.sub || ''
    } catch {
      currentUserId.value = ''
    }
    return currentUserId.value
  }

  /**
   * Make an authenticated request to the Go sidecar API.
   * The OpenCloud proxy forwards the Bearer token automatically,
   * but we include it explicitly for direct-access scenarios.
   */
  async function apiRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = getToken?.()
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return fetch(`/api/voting${path}`, {
      ...options,
      headers
    })
  }

  /**
   * Map an API error response to a user-facing message.
   * Error codes are machine-readable (ERR_*) for i18n mapping.
   * TODO (Phase 720): Replace these with $gettext() calls.
   */
  function resolveApiError(errorCode: string, fallback: string): string {
    const messages: Record<string, string> = {
      ERR_TITLE_EMPTY: 'Title is required',
      ERR_TITLE_TOO_LONG: 'Title must not exceed 255 characters',
      ERR_NOT_OWNER: 'You can only delete features you created',
      ERR_FEATURE_NOT_FOUND: 'Feature not found',
      ERR_RATE_LIMITED: 'Too many requests — please wait a moment',
      ERR_AUTH_REQUIRED: 'Authentication required',
      ERR_AUTH_MISSING: 'Authentication required',
      ERR_AUTH_INVALID: 'Session expired — please refresh the page',
      ERR_INVALID_JSON: 'Invalid request',
      ERR_INTERNAL: 'Something went wrong — please try again'
    }
    return messages[errorCode] || fallback
  }

  /**
   * Load all features from the Go API.
   */
  async function loadFeatures(): Promise<void> {
    loading.value = true
    error.value = null
    getUserId() // Ensure currentUserId is populated for template comparisons
    try {
      const res = await apiRequest('/features')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error_code: 'ERR_INTERNAL', message: 'Failed to load features' }))
        throw new Error(resolveApiError(body.error_code, body.message))
      }

      const data: FeatureListResponse = await res.json()
      // The API returns `voted` per feature based on the authenticated user.
      features.value = (data.features || []).map(f => ({
        ...f,
        voted: f.voted ?? false
      }))
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new feature request.
   */
  async function createFeature(title: string, description: string): Promise<boolean> {
    submitting.value = true
    error.value = null
    try {
      const res = await apiRequest('/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description })
      })

      if (!res.ok) {
        const body: ErrorResponse = await res.json().catch(() => ({ error_code: 'ERR_INTERNAL', message: 'Failed to create feature' }))
        error.value = resolveApiError(body.error_code, body.message)
        return false
      }

      // Reload features to get the updated list with vote counts.
      await loadFeatures()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      submitting.value = false
    }
  }

  /**
   * Delete a feature (server enforces ownership).
   */
  async function deleteFeature(id: string): Promise<boolean> {
    error.value = null
    try {
      const res = await apiRequest(`/features/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const body: ErrorResponse = await res.json().catch(() => ({ error_code: 'ERR_INTERNAL', message: 'Failed to delete feature' }))
        error.value = resolveApiError(body.error_code, body.message)
        return false
      }

      await loadFeatures()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  /**
   * Toggle vote on a feature.
   */
  async function toggleVote(featureId: string): Promise<boolean> {
    error.value = null
    try {
      const res = await apiRequest(`/features/${featureId}/vote`, {
        method: 'POST'
      })

      if (!res.ok) {
        const body: ErrorResponse = await res.json().catch(() => ({ error_code: 'ERR_INTERNAL', message: 'Failed to toggle vote' }))
        error.value = resolveApiError(body.error_code, body.message)
        return false
      }

      await loadFeatures()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  function dismissError() {
    error.value = null
  }

  return {
    features,
    loading,
    submitting,
    error,
    total,
    currentUserId,
    loadFeatures,
    createFeature,
    deleteFeature,
    toggleVote,
    dismissError
  }
}
