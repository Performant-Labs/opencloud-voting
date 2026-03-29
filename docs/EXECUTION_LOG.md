# Execution Log — OpenCloud Feature Voting

This document records every architectural decision, technical gap bridged, and deviation encountered during the execution of `docs/PLAN.md`. Each entry answers both **How** the decision was implemented and **Why** the decision was made.

---

## Phase 100: Pre-Flight & AI Agent Directives

### 110 — Execution Log Initialized
- **When**: 2026-03-29T13:15 PDT
- **How**: Created this file at `docs/EXECUTION_LOG.md`.
- **Why**: The master `PLAN.md` must remain a clean tactical checklist. All granular technical reasoning, pivots, and gap-bridging details are recorded here to provide a complete audit trail for PR reviewers without cluttering the plan.

### 120 — Subtree Verification
- **When**: 2026-03-29T13:16 PDT
- **How**: Ran `ls -la docs/ai_guidance/` confirming presence of `TROUBLESHOOTING.md`, `NAMING.md`, `README.md`, and `projects/opencloud/PLAN_INSTRUCTIONS.md`.
- **Why**: If the subtree is missing, all downstream constraint enforcement fails silently. Verified 4 files + 1 subdirectory present.

### 130 — PLAN_INSTRUCTIONS.md Digested
- **When**: 2026-03-29T13:16 PDT
- **How**: Read all 20 lines. Confirmed 4 binding constraints: (1) Idiomatic `go fmt`, (2) Standard library `ServeMux` only, (3) Never ignore errors with `_`, (4) `context.Context` as first parameter everywhere.
- **Why**: These constraints directly govern every line of Go code written in Phases 300–600.

### 140 — TROUBLESHOOTING.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Full 950-line read performed during earlier review session. Key sections for this project: Section 21 (SafeToAutoRun agent gate), Section 22 (Zombie Code requiring `pnpm build` + `cp -r` before E2E tests).
- **Why**: Both sections directly inform Phase 800 E2E testing strategy and prevent false-positive test results.

### 150 — INTERNATIONALIZE.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Read all 106 lines. Confirmed the Hybrid Strategy: (A) encapsulated `$gettext()` in `.vue` templates, (B) centralized `resolveApiError()` hook mapping in `.ts` composables. Go API returns only machine codes like `ERR_VOTE_DUPLICATE`.
- **Why**: Using `vue-i18n` would sever the extension from OpenCloud's native language switcher. The `vue3-gettext` AST compiler must physically see `$gettext('...')` calls to extract `.po` entries.

### 160 — NAMING.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Authored and read during this session. Bans: `data.json`, `app.db`, `store.sqlite`. Mandates: contextual prefixing (e.g., `feature-votes-store.sqlite`, `VotingFeatureModel`).
- **Why**: Generic naming causes catastrophic collision states when multiple OpenCloud extensions share Docker volumes.
