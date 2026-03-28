import { ref, computed } from 'vue'
import type { Feature, FeatureListResponse, VoteToggleResponse } from '../types'

const PAGE_SIZE = 50

/**
 * Composable for the voting API.
 *
 * URL resolution:
 * When deployed behind the OpenCloud proxy, the API is accessed at
 * /api/voting/features (the proxy routes /api/voting/* → voting-api:3456/*).
 *
 * Token handling:
 * OpenCloud Web manages the OIDC session. The access token must be passed
 * to this composable so it can attach it as a Bearer header. The proxy
 * then forwards it as X-Access-Token to the sidecar.
 */
export function useVotingApi(options?: { apiBaseUrl?: string; accessToken?: () => string | undefined }) {
  const baseUrl = options?.apiBaseUrl || '/api/voting'
  const getToken = options?.accessToken
  const features = ref<Feature[]>([])
  const votedIds = ref<Set<number>>(new Set())
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const total = ref(0)
  const offset = ref(0)
  const hasMore = computed(() => offset.value + features.value.length < total.value)

  async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string>)
    }

    // Attach Bearer token if available (provided by OpenCloud Web session)
    const token = getToken?.()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${baseUrl}${path}`, {
      headers,
      credentials: 'include',
      ...opts
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(data.error || `HTTP ${res.status}`)
    }

    return res.json()
  }

  async function loadFeatures(): Promise<void> {
    loading.value = true
    error.value = null
    offset.value = 0
    try {
      const data = await apiFetch<FeatureListResponse>(
        `/features?limit=${PAGE_SIZE}&offset=0`
      )
      features.value = data.features
      votedIds.value = new Set(data.votedIds)
      total.value = data.total
      offset.value = 0
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!hasMore.value) return
    const nextOffset = offset.value + PAGE_SIZE
    error.value = null
    try {
      const data = await apiFetch<FeatureListResponse>(
        `/features?limit=${PAGE_SIZE}&offset=${nextOffset}`
      )
      features.value = [...features.value, ...data.features]
      // Merge in any new votedIds
      data.votedIds.forEach((id) => votedIds.value.add(id))
      total.value = data.total
      offset.value = nextOffset
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function createFeature(title: string, description: string): Promise<Feature | null> {
    submitting.value = true
    error.value = null
    try {
      const feature = await apiFetch<Feature>('/features', {
        method: 'POST',
        body: JSON.stringify({ title, description })
      })
      await loadFeatures()
      return feature
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      submitting.value = false
    }
  }

  async function deleteFeature(id: number): Promise<boolean> {
    error.value = null
    try {
      await apiFetch(`/features/${id}`, { method: 'DELETE' })
      await loadFeatures()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function toggleVote(featureId: number): Promise<VoteToggleResponse | null> {
    error.value = null
    try {
      const result = await apiFetch<VoteToggleResponse>(`/features/${featureId}/vote`, {
        method: 'POST'
      })

      // Update local state immediately (optimistic)
      const feature = features.value.find((f) => f.id === featureId)
      if (feature) {
        feature.voteCount = result.voteCount
      }
      if (result.voted) {
        votedIds.value.add(featureId)
      } else {
        votedIds.value.delete(featureId)
      }

      return result
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  return {
    features,
    votedIds,
    loading,
    submitting,
    error,
    total,
    hasMore,
    loadFeatures,
    loadMore,
    createFeature,
    deleteFeature,
    toggleVote
  }
}
