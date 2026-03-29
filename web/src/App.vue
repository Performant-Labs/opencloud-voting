<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@opencloud-eu/web-pkg'
import { useVotingApi } from './composables/useVotingApi'

// Get the OIDC access token from the OpenCloud auth store.
// This token is used for authenticated API requests to the Go sidecar.
const authStore = useAuthStore()
const getAccessToken = () => (authStore as any).accessToken

const {
  features,
  loading,
  submitting,
  error,
  total,
  loadFeatures,
  createFeature,
  deleteFeature,
  toggleVote,
  dismissError
} = useVotingApi({ accessToken: getAccessToken })

const newTitle = ref('')
const newDescription = ref('')
const formError = ref('')

async function handleSubmit() {
  formError.value = ''
  const title = newTitle.value.trim()
  if (!title) {
    formError.value = 'Title is required'
    return
  }

  const success = await createFeature(title, newDescription.value.trim())
  if (success) {
    newTitle.value = ''
    newDescription.value = ''
  } else if (error.value) {
    formError.value = error.value
  }
}

async function handleDelete(id: string) {
  if (!confirm('Delete this feature request?')) return
  await deleteFeature(id)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

onMounted(() => {
  loadFeatures()
})
</script>

<template>
  <div class="fv-container">
    <header class="fv-header">
      <h1>Feature Voting</h1>
      <p class="fv-subtitle">Submit ideas and vote for the features you want most.</p>
    </header>

    <!-- Global error banner -->
    <div v-if="error && !formError" class="fv-error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="fv-error-dismiss" @click="dismissError" title="Dismiss">&#x2715;</button>
    </div>

    <section class="fv-submit-form">
      <h2>Suggest a Feature</h2>
      <form @submit.prevent="handleSubmit">
        <input
          v-model="newTitle"
          type="text"
          placeholder="Feature title (required)"
          maxlength="255"
          class="fv-input"
          :disabled="submitting"
        />
        <textarea
          v-model="newDescription"
          placeholder="Describe the feature (optional)"
          rows="3"
          maxlength="2000"
          class="fv-textarea"
          :disabled="submitting"
        />
        <button type="submit" class="fv-btn-primary" :disabled="submitting">
          {{ submitting ? 'Submitting…' : 'Submit' }}
        </button>
      </form>
      <p v-if="formError" class="fv-error">{{ formError }}</p>
    </section>

    <section class="fv-list-section">
      <h2>
        Feature Requests
        <span v-if="total" class="fv-count">({{ total }})</span>
      </h2>

      <p v-if="loading" class="fv-loading">Loading…</p>

      <p v-else-if="!features.length" class="fv-empty">
        No feature requests yet. Be the first!
      </p>

      <template v-else>
        <ul class="fv-list">
          <li
            v-for="feature in features"
            :key="feature.id"
            class="fv-item"
            :class="{ 'fv-voted': feature.voted }"
          >
            <div class="fv-vote-block">
              <button
                class="fv-vote-btn"
                title="Vote"
                @click="toggleVote(feature.id)"
              >
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path d="M12 4l8 8H4z" />
                </svg>
              </button>
              <span class="fv-vote-count">{{ feature.voteCount }}</span>
            </div>

            <div class="fv-content">
              <strong class="fv-item-title">{{ feature.title }}</strong>
              <p v-if="feature.description" class="fv-item-desc">{{ feature.description }}</p>
              <small class="fv-item-meta">
                {{ formatDate(feature.created_at) }}
              </small>
            </div>

            <button
              class="fv-delete-btn"
              title="Delete"
              @click="handleDelete(feature.id)"
            >
              &#x2715;
            </button>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.fv-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}

.fv-header {
  margin-bottom: 32px;
}
.fv-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.fv-subtitle {
  color: var(--oc-color-text-muted, #6b7280);
}

/* Error banner */
.fv-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 20px;
  background: var(--oc-color-swatch-danger-muted, #fef2f2);
  border: 1px solid var(--oc-color-swatch-danger-default, #ef4444);
  border-radius: 8px;
  color: var(--oc-color-swatch-danger-default, #dc2626);
  font-size: 0.9rem;
}
.fv-error-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 1rem;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}
.fv-error-dismiss:hover {
  background: var(--oc-color-swatch-danger-default, #ef4444);
  color: #fff;
}

/* Submit form */
.fv-submit-form {
  background: var(--oc-color-background-default, #fff);
  border: 1px solid var(--oc-color-border, #e5e7eb);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 32px;
}
.fv-submit-form h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 12px;
}
.fv-input,
.fv-textarea {
  width: 100%;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 6px;
  background: var(--oc-color-background-default, #fff);
  color: var(--oc-color-text-default, #111827);
  font-size: 0.95rem;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.fv-input:focus,
.fv-textarea:focus {
  outline: none;
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-input:disabled,
.fv-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-textarea {
  resize: vertical;
}
.fv-btn-primary {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: var(--oc-color-swatch-primary-default, #6366f1);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.fv-btn-primary:hover:not(:disabled) {
  background: var(--oc-color-swatch-primary-hover, #4f46e5);
}
.fv-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-error {
  color: var(--oc-color-swatch-danger-default, #ef4444);
  margin-top: 6px;
  font-size: 0.9rem;
}

/* List section */
.fv-list-section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 14px;
}
.fv-count {
  color: var(--oc-color-text-muted, #6b7280);
  font-weight: 400;
  font-size: 0.95rem;
}
.fv-loading,
.fv-empty {
  color: var(--oc-color-text-muted, #6b7280);
  padding: 16px 0;
}

/* Feature list */
.fv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fv-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: var(--oc-color-background-default, #fff);
  border: 1px solid var(--oc-color-border, #e5e7eb);
  border-radius: 8px;
  padding: 14px 16px;
  transition: border-color 0.15s;
}
.fv-item:hover {
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}

/* Vote block */
.fv-vote-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  gap: 2px;
}
.fv-vote-btn {
  background: none;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--oc-color-text-muted, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.fv-vote-btn svg {
  fill: currentColor;
}
.fv-vote-btn:hover {
  background: var(--oc-color-swatch-primary-muted, #eef2ff);
  color: var(--oc-color-swatch-primary-default, #6366f1);
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-vote-btn:active {
  transform: scale(0.92);
}
.fv-voted .fv-vote-btn {
  background: var(--oc-color-swatch-primary-default, #6366f1);
  color: #fff;
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-vote-count {
  font-weight: 700;
  font-size: 1rem;
  color: var(--oc-color-text-default, #111827);
}

/* Content */
.fv-content {
  flex: 1;
  min-width: 0;
}
.fv-item-title {
  font-size: 1rem;
  display: block;
  margin-bottom: 4px;
}
.fv-item-desc {
  color: var(--oc-color-text-muted, #6b7280);
  font-size: 0.9rem;
  margin: 0 0 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
.fv-item-meta {
  color: var(--oc-color-text-muted, #9ca3af);
  font-size: 0.8rem;
}

/* Delete button */
.fv-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--oc-color-text-muted, #6b7280);
  font-size: 1rem;
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  flex-shrink: 0;
  align-self: flex-start;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
.fv-item:hover .fv-delete-btn {
  opacity: 1;
}
.fv-delete-btn:hover {
  color: var(--oc-color-swatch-danger-default, #ef4444);
}
</style>
