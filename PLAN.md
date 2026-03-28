# Nextcloud Voting App — Plan

**Repo:** https://github.com/Performant-Labs/nextcloud-voting
**App ID:** `feature_voting`
**Namespace:** `OCA\FeatureVoting`

---

## What exists today

A working prototype lives in the local `nextcloud` core checkout at
`apps/feature_voting/`. It is a plain PHP + vanilla-JS app with:

| Layer | Files |
|---|---|
| App manifest | `appinfo/info.xml`, `appinfo/routes.php` |
| DB migration | `lib/Migration/Version1000Date20260326000000.php` |
| Entities | `lib/Db/Feature.php`, `lib/Db/Vote.php` |
| Mappers | `lib/Db/FeatureMapper.php`, `lib/Db/VoteMapper.php` |
| Service | `lib/Service/FeatureService.php` |
| Controllers | `lib/Controller/PageController.php`, `FeatureController.php`, `VoteController.php` |
| Template | `templates/index.php` (inline JS + HTML `<template>`) |
| Styles | `css/style.css` |

**DB schema** (two tables):
- `featurevoting_features` — id, title, description, user_id, vote_count, created_at
- `featurevoting_votes` — id, feature_id, user_id (unique index on feature+user)

**API routes:**
```
GET    /apps/feature_voting/features
POST   /apps/feature_voting/features
DELETE /apps/feature_voting/features/{id}
POST   /apps/feature_voting/features/{id}/vote   (toggle)
```

---

## Phase 1 — Move to standalone repo

1. Clone the `nextcloud-voting` repo locally.
2. Copy `apps/feature_voting/` from the core checkout into the new repo root.
3. Add `.gitignore`, `composer.json` (for Nextcloud app conventions), and `Makefile`.
4. Push and verify the repo structure matches the [Nextcloud app store skeleton](https://github.com/nextcloud/app-tutorial).

---

## Phase 2 — Deployment to remote server

**Server:** `ssh aangel@172.232.174.154`

Steps:
1. SSH in and locate the Nextcloud instance (likely `/var/www/nextcloud` or `/var/www/html`).
2. `git clone` the repo into `<nextcloud-root>/apps/feature_voting/`.
3. Enable the app: `sudo -u www-data php occ app:enable feature_voting`.
4. Run migrations: `sudo -u www-data php occ migrations:execute feature_voting`.
5. Verify in the Nextcloud UI.

---

## Phase 3 — Enhancements (backlog)

These are candidate improvements, not yet scoped:

### UX
- [ ] Replace inline JS with a Vue 3 component (matches Nextcloud 28+ conventions)
- [ ] Sort toggle: by votes (default) vs. newest
- [ ] Search/filter bar
- [ ] Status tags on features: *Open*, *Planned*, *Shipped*, *Declined*

### Permissions & moderation
- [ ] Admin-only: change feature status
- [ ] Admin-only: pin a feature to the top
- [ ] Option to restrict feature submission to admins (view-only mode for regular users)

### Data model
- [ ] `status` column on `featurevoting_features` (open/planned/shipped/declined)
- [ ] `pinned` boolean on features
- [ ] Optional: categories/tags

### Developer experience
- [ ] PHPUnit tests for `FeatureService`
- [ ] Playwright or Cypress smoke test for the UI
- [ ] GitHub Actions CI (lint + unit tests on push)
- [ ] `make appstore` target to build a release archive

---

## Open questions

- Should regular users be able to delete only their own submissions (current), or also allow admins to delete any?
- Should vote counts be hidden until a minimum number of votes is reached (anti-bandwagon)?
- Multi-vote support (e.g. each user gets N votes to allocate) — worth considering before the schema is locked.
