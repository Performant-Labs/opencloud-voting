<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "@opencloud-eu/web-pkg";
import { useVotingApi } from "./composables/useVotingApi";

const authStore = useAuthStore();
const getAccessToken = () => (authStore as any).accessToken;

const { createFeature, submitting, error, dismissError } = useVotingApi({
  accessToken: getAccessToken,
});

const newTitle = ref("");
const newDescription = ref("");
const formError = ref("");

async function handleSubmit() {
  formError.value = "";
  const title = newTitle.value.trim();
  if (!title) {
    formError.value = "Title is required";
    return;
  }

  const success = await createFeature(title, newDescription.value.trim());
  if (success) {
    window.history.back();
  } else if (error.value) {
    formError.value = error.value;
  }
}
</script>

<template>
  <div class="fv-container">
    <header class="fv-header">
      <h1>Suggest a Feature</h1>
      <p class="fv-subtitle">
        Submit your idea for the OpenCloud Feature Voting board.
      </p>
    </header>

    <div v-if="error && !formError" class="fv-error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="fv-error-dismiss" @click="dismissError" title="Dismiss">
        &#x2715;
      </button>
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
            @click="$router.push('/feature-voting/board')"
            :disabled="submitting"
          >
            Cancel
          </button>
        </div>
      </form>
      <p v-if="formError" class="fv-error">{{ formError }}</p>
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
.fv-input,
.fv-textarea {
  width: 100%;
  margin-bottom: 12px;
  padding: 10px 12px;
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
.fv-form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
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
  transition:
    background 0.15s,
    opacity 0.15s;
}
.fv-btn-primary:hover:not(:disabled) {
  background: var(--oc-color-swatch-primary-hover, #4f46e5);
}
.fv-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-btn-secondary {
  padding: 8px 20px;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 6px;
  background: var(--oc-color-background-default, #fff);
  color: var(--oc-color-text-default, #111827);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.fv-btn-secondary:hover:not(:disabled) {
  background: var(--oc-color-background-muted, #f3f4f6);
}
.fv-btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fv-error {
  color: var(--oc-color-swatch-danger-default, #ef4444);
  margin-top: 6px;
  font-size: 0.9rem;
}
</style>
