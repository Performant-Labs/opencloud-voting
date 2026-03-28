import { ref } from 'vue'
import type { Feature, FeatureListResponse, VoteToggleResponse } from '../types'

/**
 * Composable for the voting API.
 *
 * The API base URL is resolved at runtime:
 * 1. From the OpenCloud app config (`applicationConfig.apiUrl`)
 * 2. Fall back to same-origin `/api` path (reverse proxy)
 * 3. Fall back to localhost:3456 for standalone dev
 */
export function useVotingApi(apiBaseUrl?: string) {
  const baseUrl = apiBaseUrl || '/api'
  const features = ref<Feature[]>([])
  const votedIds = ref<Set<number>>(new Set())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers
      },
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
    try {
      const data = await apiFetch<FeatureListResponse>('/features')
      features.value = data.features
      votedIds.value = new Set(data.votedIds)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createFeature(title: string, description: string): Promise<Feature | null> {
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

      // Update local state immediately
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
    error,
    loadFeatures,
    createFeature,
    deleteFeature,
    toggleVote
  }
}
