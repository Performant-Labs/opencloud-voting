import { ref, computed } from 'vue'
import type { Feature, FeatureWithVoted, VotingData } from '../types'

/**
 * Composable for the voting API using OpenCloud WebDAV storage.
 *
 * All voting data is stored as a single JSON file in the user's personal
 * space at `.feature-voting/feature-votes.json`. The file is read/written via
 * authenticated WebDAV requests using the OIDC session.
 *
 * OpenCloud (oCIS) uses the Spaces WebDAV API:
 *   1. Discover the personal space ID via GET /graph/v1beta1/me/drives
 *   2. Access files via /dav/spaces/{spaceId}/path
 *
 * Concurrency: uses ETag-based optimistic locking on writes.
 * If a conflict occurs (HTTP 412), the data is re-read and the
 * operation is retried once.
 */

const DATA_PATH = 'feature-votes.json'

function emptyData(): VotingData {
  return { features: [], votes: {} }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function useVotingApi(options?: {
  accessToken?: () => string | undefined
}) {
  const getToken = options?.accessToken

  const features = ref<FeatureWithVoted[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const total = computed(() => features.value.length)

  // Current user ID extracted from the OIDC token (for vote tracking)
  let currentUserId = ''

  // Cached personal space ID from the Graph API
  const spaceIdRef = ref('')
  let cachedSpaceId = ''

  // ETag for optimistic concurrency
  let currentETag = ''

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    const token = getToken?.()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  /**
   * Decode the JWT to extract user identity (without validation —
   * the server already validated it).
   */
  function getUserId(): string {
    if (currentUserId) return currentUserId
    const token = getToken?.()
    if (!token) return 'anonymous'
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      currentUserId = payload.preferred_username || payload.sub || 'anonymous'
    } catch {
      currentUserId = 'anonymous'
    }
    return currentUserId
  }

  /**
   * Discover the shared Project Space ID via the OpenCloud Graph API.
   * Looks for a drive named "Feature Voting Data" with driveType "project".
   * Result is cached after first call.
   */
  async function getSharedSpaceId(): Promise<string> {
    if (cachedSpaceId) return cachedSpaceId

    const res = await fetch('/graph/v1.0/drives', {
      method: 'GET',
      headers: {
        ...authHeaders(),
        'Accept': 'application/json'
      }
    })

    if (!res.ok) {
      throw new Error(`Failed to read available spaces: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    const drives = data.value || data
    const sharedSpaces = Array.isArray(drives)
      ? drives.filter((d: any) => d.driveType === 'project' && d.name.startsWith('Feature Voting Data'))
      : []

    // Take the most recent one by sorting alphabetically (timestamp is at the end)
    const sharedSpace = sharedSpaces.sort((a, b) => b.name.localeCompare(a.name))[0]

    if (!sharedSpace?.id) {
      throw new Error("The Feature Voting Data project space has not been configured. Please ask your administrator to create a project space named 'Feature Voting Data' and grant access to all users.")
    }

    cachedSpaceId = sharedSpace.id
    spaceIdRef.value = cachedSpaceId
    return cachedSpaceId
  }

  /**
   * Build the WebDAV URL for the voting data file using the Spaces API.
   */
  function davUrl(spaceId: string): string {
    return `/dav/spaces/${spaceId}/${DATA_PATH}`
  }

  /**
   * Read the voting data file. Returns empty data if the file doesn't exist.
   */
  async function readData(): Promise<VotingData> {
    const spaceId = await getSharedSpaceId()
    const res = await fetch(davUrl(spaceId), {
      method: 'GET',
      headers: {
        ...authHeaders(),
        'Accept': 'application/json'
      }
    })

    if (res.status === 404) {
      currentETag = ''
      return emptyData()
    }

    if (!res.ok) {
      throw new Error(`Failed to read voting data: ${res.status} ${res.statusText}`)
    }

    currentETag = res.headers.get('ETag') || ''
    const text = await res.text()
    try {
      return JSON.parse(text) as VotingData
    } catch {
      return emptyData()
    }
  }

  /**
   * Write the voting data file. Creates the parent folder if needed.
   * Uses If-Match header for optimistic concurrency.
   */
  async function writeData(data: VotingData, retry = true): Promise<void> {
    const spaceId = await getSharedSpaceId()
    const body = JSON.stringify(data, null, 2)

    const headers: Record<string, string> = {
      ...authHeaders(),
      'Content-Type': 'application/json'
    }

    // Use ETag for optimistic concurrency (skip on first write)
    if (currentETag) {
      headers['If-Match'] = currentETag
    }

    const res = await fetch(davUrl(spaceId), {
      method: 'PUT',
      headers,
      body
    })

    // 412 = ETag mismatch (concurrent edit) → re-read and retry once
    if (res.status === 412 && retry) {
      // Re-read to get fresh data — caller must re-apply their change
      throw new Error('CONFLICT')
    }

    if (!res.ok) {
      throw new Error(`Failed to write voting data: ${res.status} ${res.statusText}`)
    }

    // Update ETag from response
    currentETag = res.headers.get('ETag') || ''
  }

  /**
   * Transform raw data into the view model with voted status.
   */
  function toFeatureList(data: VotingData, userId: string): FeatureWithVoted[] {
    return data.features
      .map((f) => ({
        ...f,
        voteCount: (data.votes[f.id] || []).length,
        voted: (data.votes[f.id] || []).includes(userId)
      }))
      .sort((a, b) => b.voteCount - a.voteCount || b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Load all features from storage.
   */
  async function loadFeatures(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await readData()
      const userId = getUserId()
      features.value = toFeatureList(data, userId)
    } catch (e) {
      error.value = (e as Error).message
      console.error("LOAD FEATURES ERROR:", e)
      document.body.setAttribute('data-load-error', error.value)
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new feature request.
   */
  async function createFeature(title: string, description: string): Promise<Feature | null> {
    submitting.value = true
    error.value = null
    try {
      const data = await readData()
      const userId = getUserId()
      const feature: Feature = {
        id: generateId(),
        title: title.replace(/<[^>]*>/g, '').trim().slice(0, 255),
        description: (description.replace(/<[^>]*>/g, '').trim() || '').slice(0, 2000),
        userId,
        voteCount: 0,
        createdAt: new Date().toISOString()
      }
      data.features.push(feature)
      await writeData(data)
      features.value = toFeatureList(data, userId)
      return feature
    } catch (e) {
      if ((e as Error).message === 'CONFLICT') {
        // Retry once on conflict
        try {
          return await createFeature(title, description)
        } catch (e2) {
          error.value = (e2 as Error).message
          return null
        }
      }
      error.value = (e as Error).message
      return null
    } finally {
      submitting.value = false
    }
  }

  /**
   * Delete a feature (owner only, enforced client-side).
   */
  async function deleteFeature(id: string): Promise<boolean> {
    error.value = null
    try {
      const data = await readData()
      const userId = getUserId()
      const feature = data.features.find((f) => f.id === id)
      if (!feature) {
        error.value = 'Feature not found'
        return false
      }
      if (feature.userId !== userId) {
        error.value = 'You can only delete your own features'
        return false
      }
      data.features = data.features.filter((f) => f.id !== id)
      delete data.votes[id]
      await writeData(data)
      features.value = toFeatureList(data, userId)
      return true
    } catch (e) {
      if ((e as Error).message === 'CONFLICT') {
        try {
          return await deleteFeature(id)
        } catch (e2) {
          error.value = (e2 as Error).message
          return false
        }
      }
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
      const data = await readData()
      const userId = getUserId()

      if (!data.votes[featureId]) {
        data.votes[featureId] = []
      }

      const idx = data.votes[featureId].indexOf(userId)
      if (idx >= 0) {
        data.votes[featureId].splice(idx, 1)
      } else {
        data.votes[featureId].push(userId)
      }

      await writeData(data)
      features.value = toFeatureList(data, userId)
      return true
    } catch (e) {
      if ((e as Error).message === 'CONFLICT') {
        try {
          return await toggleVote(featureId)
        } catch (e2) {
          error.value = (e2 as Error).message
          return false
        }
      }
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
    loadFeatures,
    createFeature,
    deleteFeature,
    toggleVote,
    dismissError,
    spaceIdRef
  }
}
