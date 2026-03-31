<script setup lang="ts">
import { ref } from "vue"
import { useAuthStore, useRouter } from "@opencloud-eu/web-pkg"
import { useVotingApi } from "./composables/useVotingApi"
import Breadcrumbs from "./components/Breadcrumbs.vue"

const breadcrumbs = [
  { label: 'Home', to: '/' },
  { label: 'Feature Voting', to: '/feature-voting/board' },
  { label: 'Suggest a Feature' }
]

const authStore = useAuthStore()
const getAccessToken = () => (authStore as any).accessToken

const { createFeature, submitting, error, dismissError } = useVotingApi({
  accessToken: getAccessToken,
})

const newTitle = ref("")
const newDescription = ref("")
const formError = ref("")

const router = useRouter()

function navigateToBoard() {
  router.push({ path: '/feature-voting/board' })
}

async function handleSubmit() {
  formError.value = ""
  const title = newTitle.value.trim()
  if (!title) {
    formError.value = "Title is required"
    return
  }

  const success = await createFeature(title, newDescription.value.trim())
  if (success) {
    navigateToBoard()
  } else if (error.value) {
    formError.value = error.value
  }
}
</script>

<template>
  <div class="fv-container">
    <Breadcrumbs :items="breadcrumbs" />
    <header class="fv-header">
      <h1>Suggest a Feature</h1>
      <p class="fv-subtitle">
        Submit your idea for the OpenCloud Feature Voting board.
      </p>
    </header>

    <div v-if="error && !formError" class="fv-error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="fv-error-dismiss" title="Dismiss" @click="dismissError">
        &#x2715;
      </button>
    </div>

    <div v-if="formError" class="fv-error-banner" role="alert" data-testid="form-error">
      <span>{{ formError }}</span>
    </div>

    <section class="fv-submit-form">
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
          rows="5"
          maxlength="2000"
          class="fv-textarea"
          :disabled="submitting"
        />
        <div class="fv-form-actions">
          <button type="submit" class="fv-btn-primary" :disabled="submitting">
            {{ submitting ? "Submitting…" : "Submit" }}
          </button>
          <button
            type="button"
            class="fv-btn-secondary"
            :disabled="submitting"
            @click="navigateToBoard()"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>

  </div>
</template>

<style scoped>
.fv-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  height: 100%;
  overflow-y: auto;
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
  color: inherit;
  opacity: 0.6;
}

/* Error banner */
.fv-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 20px;
  background: var(--oc-role-error-container, #FFDAD6);
  border: 1px solid var(--oc-role-error, #BA1A1A);
  border-radius: 8px;
  color: var(--oc-role-error, #BA1A1A);
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
  background: var(--oc-role-error, #BA1A1A);
  color: var(--oc-role-on-error, #fff);
}

/* Submit form */
.fv-submit-form {
  background: var(--oc-role-surface, transparent);
  border: 1px solid var(--oc-role-outline-variant, #BFC8CC);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 32px;
}
.fv-input,
.fv-textarea {
  width: 100%;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--oc-role-outline-variant, #BFC8CC);
  border-radius: 6px;
  background: var(--oc-role-surface, transparent);
  color: inherit;
  font-size: 0.95rem;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.fv-input:focus,
.fv-textarea:focus {
  outline: none;
  border-color: var(--oc-role-primary, #00677F);
}
.fv-input:disabled,
.fv-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-textarea {
  resize: vertical;
}
.fv-form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.fv-btn-primary {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: var(--oc-role-primary, #00677F);
  color: var(--oc-role-on-primary, #fff);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.fv-btn-primary:hover:not(:disabled) {
  background: var(--oc-role-primary, #00677F);
  filter: brightness(0.85);
}
.fv-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-btn-secondary {
  padding: 8px 20px;
  border: 1px solid var(--oc-role-outline-variant, #BFC8CC);
  border-radius: 6px;
  background: var(--oc-role-surface, transparent);
  color: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.fv-btn-secondary:hover:not(:disabled) {
  background: var(--oc-role-surface-container, #F6F8FA);
}
.fv-btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-error {
  color: var(--oc-role-error, #BA1A1A);
  margin-top: 6px;
  font-size: 0.9rem;
}

</style>
