<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue"
import Fuse from "fuse.js"
import { useAuthStore } from "@opencloud-eu/web-pkg"
import { useVotingApi } from "./composables/useVotingApi"
import Breadcrumbs from "./components/Breadcrumbs.vue"
import type { Comment } from "./types"

const breadcrumbs = [
  { label: 'Home', to: '/' },
  { label: 'Feature Voting' }
]

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
  currentUserId,
  isAdmin,
  loadFeatures,
  deleteFeature,
  archiveFeature,
  toggleVote,
  listComments,
  createComment,
  deleteComment,
  dismissError,
} = useVotingApi({ accessToken: getAccessToken })

// Comment state keyed by feature ID
const expandedComments = ref<Set<string>>(new Set())
const commentsByFeature = ref<Record<string, Comment[]>>({})
const commentLoadingFor = ref<Set<string>>(new Set())
const newCommentBody = ref<Record<string, string>>({})
const commentSubmittingFor = ref<Set<string>>(new Set())

async function toggleComments(featureId: string) {
  if (expandedComments.value.has(featureId)) {
    expandedComments.value.delete(featureId)
    return
  }
  expandedComments.value.add(featureId)
  await refreshComments(featureId)
}

async function refreshComments(featureId: string) {
  commentLoadingFor.value.add(featureId)
  commentsByFeature.value[featureId] = await listComments(featureId)
  commentLoadingFor.value.delete(featureId)
}

async function submitComment(featureId: string) {
  const body = (newCommentBody.value[featureId] || "").trim()
  if (!body) return
  commentSubmittingFor.value.add(featureId)
  const ok = await createComment(featureId, body)
  if (ok) {
    newCommentBody.value[featureId] = ""
    await refreshComments(featureId)
  }
  commentSubmittingFor.value.delete(featureId)
}

async function handleDeleteComment(featureId: string, commentId: string) {
  if (!confirm("Delete this comment?")) return
  const ok = await deleteComment(featureId, commentId)
  if (ok) await refreshComments(featureId)
}

const openMenuId = ref<string | null>(null)

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeAllMenus() {
  openMenuId.value = null
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest(".fv-actions")) {
    closeAllMenus()
  }
}

async function handleDelete(id: string) {
  closeAllMenus()
  if (!confirm("Delete this feature request?")) return
  await deleteFeature(id)
}

async function handleArchive(id: string) {
  closeAllMenus()
  await archiveFeature(id)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

const searchQuery = ref("")

const fuse = computed(() => {
  return new Fuse(features.value, {
    keys: [
      { name: "title", weight: 2.0 },
      { name: "description", weight: 1.0 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
  })
})

const filteredFeatures = computed(() => {
  if (!searchQuery.value.trim()) return features.value
  return fuse.value
    .search(searchQuery.value.trim())
    .map((result) => result.item)
})

onMounted(() => {
  loadFeatures()
  document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside)
})
</script>

<template>
  <div class="fv-container">
    <Breadcrumbs :items="breadcrumbs" />
    <header class="fv-header">
      <div class="fv-header-top">
        <div>
          <h1>Feature Voting</h1>
          <p class="fv-subtitle">
            Submit ideas and vote for the features you want most.
          </p>
        </div>
        <button
          class="fv-btn-primary"
          @click="$router.push('/feature-voting/new')"
        >
          Suggest a Feature
        </button>
      </div>
    </header>

    <!-- Global error banner -->
    <div v-if="error" class="fv-error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="fv-error-dismiss" title="Dismiss" @click="dismissError">
        &#x2715;
      </button>
    </div>

    <section class="fv-list-section">
      <h2>
        Feature Requests
        <span v-if="total" class="fv-count">({{ total }})</span>
      </h2>

      <p v-if="loading" class="fv-loading">Loading…</p>

      <p v-else-if="!features.length" class="fv-empty">
        No feature requests yet. Be the first!
      </p>

      <!-- Features List Wrapper -->
      <template v-else>
        <!-- Search Bar: Only show if there are features in the system -->
        <div v-if="features.length > 0" class="fv-search-container">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search features..."
            class="fv-search-input"
          />
        </div>

        <!-- Empty search results state -->
        <p
          v-if="searchQuery.trim() && filteredFeatures.length === 0"
          class="fv-empty"
        >
          No features found matching "{{ searchQuery }}".
        </p>

        <ul v-else class="fv-list">
          <li
            v-for="feature in filteredFeatures"
            :key="feature.id"
            class="fv-item"
            :class="{ 'fv-voted': feature.voted }"
            :data-feature-id="feature.id"
          >
            <div class="fv-vote-block">
              <button
                class="fv-vote-btn"
                :class="{
                  'fv-voted-btn':
                    feature.voted && feature.created_by !== currentUserId,
                  'fv-vote-disabled': feature.created_by === currentUserId,
                }"
                :title="
                  feature.created_by === currentUserId
                    ? 'Your feature'
                    : feature.voted
                      ? 'Remove vote'
                      : 'Vote'
                "
                :disabled="feature.created_by === currentUserId"
                @click="toggleVote(feature.id)"
              >
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    v-if="
                      feature.created_by === currentUserId || !feature.voted
                    "
                    d="M12 4l8 8H4z"
                  />
                  <path v-else d="M12 20l-8-8h16z" />
                </svg>
              </button>
              <span class="fv-vote-count">{{ feature.vote_count }}</span>
            </div>

            <div class="fv-content">
              <strong class="fv-item-title">{{ feature.title }}</strong>
              <p v-if="feature.description" class="fv-item-desc">
                {{ feature.description }}
              </p>
              <div class="fv-item-footer">
                <small class="fv-item-meta">
                  {{ formatDate(feature.created_at) }}
                </small>

                <!-- Comment toggle -->
                <button
                  class="fv-comments-toggle"
                  @click.stop="toggleComments(feature.id)"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M21 6c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h11l4 4V6z"/>
                  </svg>
                  {{ feature.comment_count }} comment{{ feature.comment_count === 1 ? '' : 's' }}
                </button>
              </div>

              <!-- Inline comment section -->
              <div v-if="expandedComments.has(feature.id)" class="fv-comments">
                <p v-if="commentLoadingFor.has(feature.id)" class="fv-comments-loading">Loading…</p>
                <template v-else>
                  <div
                    v-for="comment in (commentsByFeature[feature.id] || [])"
                    :key="comment.id"
                    class="fv-comment"
                  >
                    <div class="fv-comment-header">
                      <span class="fv-comment-author">{{ comment.user_name }}</span>
                      <span class="fv-comment-date">{{ formatDate(comment.created_at) }}</span>
                      <button
                        v-if="comment.user_id === currentUserId || isAdmin"
                        class="fv-comment-delete"
                        @click.stop="handleDeleteComment(feature.id, comment.id)"
                      >Delete</button>
                    </div>
                    <p class="fv-comment-body">{{ comment.body }}</p>
                  </div>
                  <p v-if="!(commentsByFeature[feature.id] || []).length" class="fv-comments-empty">
                    No comments yet.
                  </p>
                </template>

                <!-- New comment form -->
                <div class="fv-comment-form">
                  <textarea
                    v-model="newCommentBody[feature.id]"
                    class="fv-comment-input"
                    placeholder="Add a comment…"
                    rows="2"
                    maxlength="2000"
                    @keydown.ctrl.enter.prevent="submitComment(feature.id)"
                    @keydown.meta.enter.prevent="submitComment(feature.id)"
                  />
                  <button
                    class="fv-btn-primary fv-comment-submit"
                    :disabled="commentSubmittingFor.has(feature.id) || !(newCommentBody[feature.id] || '').trim()"
                    @click.stop="submitComment(feature.id)"
                  >
                    {{ commentSubmittingFor.has(feature.id) ? 'Posting…' : 'Post' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="isAdmin" class="fv-actions">
              <button
                class="fv-actions-trigger"
                :title="'Actions'"
                @click.stop="toggleMenu(feature.id)"
              >
                &#x22EF;
              </button>
              <div v-if="openMenuId === feature.id" class="fv-actions-menu">
                <ul>
                  <li>
                    <button
                      class="fv-action-item"
                      @click="handleArchive(feature.id)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="currentColor"
                      >
                        <path
                          d="M20 2H4c-1.1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-.9-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z"
                        />
                      </svg>
                      Archive
                    </button>
                  </li>
                  <li>
                    <button
                      class="fv-action-item fv-action-danger"
                      @click="handleDelete(feature.id)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="currentColor"
                      >
                        <path
                          d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                        />
                      </svg>
                      Delete
                    </button>
                  </li>
                </ul>
              </div>
            </div>
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
.fv-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
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

/* Search Input */
.fv-search-container {
  margin-bottom: 20px;
}
.fv-search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 6px;
  font-size: 1rem;
  background: var(--oc-color-background-default, #fff);
  color: var(--oc-color-text-default, #111827);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.fv-search-input:focus {
  outline: none;
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
  box-shadow: 0 0 0 2px var(--oc-color-swatch-primary-muted, #eef2ff);
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
  transition:
    background 0.15s,
    color 0.15s,
    transform 0.1s;
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
.fv-voted .fv-vote-btn,
.fv-voted-btn {
  background: var(--oc-color-swatch-primary-default, #6366f1);
  color: #fff;
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-vote-disabled {
  opacity: 0.35;
  cursor: default;
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

/* Actions three-dot menu */
.fv-actions {
  position: relative;
  flex-shrink: 0;
  align-self: flex-start;
}
.fv-actions-trigger {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--oc-color-text-muted, #6b7280);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 2px 6px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.15s,
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}
.fv-item:hover .fv-actions-trigger,
.fv-actions-trigger[aria-expanded="true"] {
  opacity: 1;
}
.fv-actions-trigger:hover {
  color: var(--oc-color-text-default, #111827);
  background: var(--oc-color-background-muted, #f3f4f6);
  border-color: var(--oc-color-border, #d1d5db);
}

.fv-actions-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  min-width: 160px;
  margin-top: 4px;
  background: var(--oc-color-background-default, #fff);
  border: 1px solid var(--oc-color-border, #e5e7eb);
  border-radius: 10px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.08),
    0 1px 4px rgba(0, 0, 0, 0.04);
  padding: 4px;
  animation: fv-menu-enter 0.12s ease-out;
}
@keyframes fv-menu-enter {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.fv-actions-menu ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fv-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--oc-color-text-default, #111827);
  text-align: left;
  transition:
    background 0.12s,
    color 0.12s;
}
.fv-action-item:hover {
  background: var(--oc-color-background-muted, #f3f4f6);
}
.fv-action-danger {
  color: var(--oc-color-swatch-danger-default, #ef4444);
}
.fv-action-danger:hover {
  background: var(--oc-color-swatch-danger-muted, #fef2f2);
}

/* Footer row: date + comment toggle */
.fv-item-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

/* Comment toggle button */
.fv-comments-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 20px;
  background: none;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--oc-color-text-muted, #6b7280);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.fv-comments-toggle:hover {
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
  color: var(--oc-color-swatch-primary-default, #6366f1);
  background: var(--oc-color-swatch-primary-muted, #eef2ff);
}

/* Comment section */
.fv-comments {
  margin-top: 12px;
  border-top: 1px solid var(--oc-color-border, #e5e7eb);
  padding-top: 12px;
}
.fv-comments-loading,
.fv-comments-empty {
  font-size: 0.82rem;
  color: var(--oc-color-text-muted, #9ca3af);
  margin: 0 0 10px;
}
.fv-comment {
  margin-bottom: 10px;
}
.fv-comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.fv-comment-author {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--oc-color-text-default, #111827);
}
.fv-comment-date {
  font-size: 0.76rem;
  color: var(--oc-color-text-muted, #9ca3af);
}
.fv-comment-delete {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--oc-color-swatch-danger-default, #ef4444);
  font-size: 0.75rem;
  padding: 1px 4px;
  border-radius: 4px;
  line-height: 1;
  text-decoration: underline;
  transition: background 0.15s;
}
.fv-comment-delete:hover {
  background: var(--oc-color-swatch-danger-muted, #fef2f2);
}
.fv-comment-body {
  font-size: 0.88rem;
  color: var(--oc-color-text-default, #374151);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* New comment form */
.fv-comment-form {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-top: 10px;
}
.fv-comment-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--oc-color-border, #d1d5db);
  border-radius: 6px;
  font-size: 0.88rem;
  font-family: inherit;
  resize: vertical;
  background: var(--oc-color-background-default, #fff);
  color: var(--oc-color-text-default, #111827);
  transition: border-color 0.15s;
}
.fv-comment-input:focus {
  outline: none;
  border-color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-comment-submit {
  padding: 7px 14px;
  font-size: 0.88rem;
  white-space: nowrap;
  flex-shrink: 0;
}

</style>
