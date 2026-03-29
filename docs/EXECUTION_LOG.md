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

---

## Phase 200: Privacy & Compliance Assessment (GDPR / CCPA)

### 210 — Data Flow Research
- **When**: 2026-03-29T13:20 PDT
- **How**: Audited `web/src/types.ts` and `web/src/composables/useVotingApi.ts` to inventory every user-facing data field. Discovered the legacy code uses `preferred_username || sub` as the user identifier (line 70 of `useVotingApi.ts`).
- **Why**: `preferred_username` is directly identifiable PII (e.g., `"john.smith"`). Storing it violates GDPR Article 5(1)(c) data minimization. The new Go sidecar must exclusively use the opaque `sub` claim, which is a pseudonymous UUID that cannot be reverse-engineered without identity provider access.
- **Decision**: The `preferred_username` and `email` OIDC claims will **never** be persisted to the database. Only `sub` is stored. This mandatory change directly influences the Go models in Phase 400 (Step 410).

### 220 — PRIVACY_ASSESSMENT.md Written
- **When**: 2026-03-29T13:21 PDT
- **How**: Created `docs/PRIVACY_ASSESSMENT.md` with 7 sections covering: Controller/Processor classification, PII inventory table, the `sub` vs `preferred_username` decision, Right to Erasure cascading SQL, data minimization audit, CCPA obligations, and technical safeguards.
- **Why**: Enterprise OpenCloud deployments serving EU customers require formal GDPR documentation. Without this assessment, the extension could expose the hosting organization to regulatory fines.
- **Decision**: Default behavior is full cascading deletion (not anonymization) when a user is removed. Anonymization is documented as a Controller-configurable alternative.
