import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'

// Mock the composable
vi.mock('../../src/composables/useVotingApi', () => ({
  useVotingApi: () => ({
    features: { value: [] },
    votedIds: { value: new Set() },
    loading: { value: false },
    error: { value: null },
    loadFeatures: vi.fn(),
    createFeature: vi.fn(),
    deleteFeature: vi.fn(),
    toggleVote: vi.fn()
  })
}))

describe('App.vue', () => {
  it('renders the header', () => {
    const wrapper = mount(App)
    expect(wrapper.find('.fv-header h1').text()).toBe('Feature Voting')
  })

  it('shows empty state when no features', () => {
    const wrapper = mount(App)
    expect(wrapper.find('.fv-empty').exists()).toBe(true)
  })

  it('renders the submit form', () => {
    const wrapper = mount(App)
    expect(wrapper.find('.fv-submit-form').exists()).toBe(true)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })
})
