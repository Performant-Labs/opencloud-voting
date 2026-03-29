# Internationalization (i18n) Strategy
**OpenCloud Feature Voting Extension**

This document explicitly defines the translation and multi-language architecture for the OpenCloud Feature Voting module. It details why specific technologies were chosen to comply with OpenCloud (oCIS) enterprise standards.

---

## 1. The Core Philosophy (Why `vue3-gettext` over `vue-i18n`)

In the broader Vue.js ecosystem, **`vue-i18n`** is universally considered the "Gold Standard" library for multi-language applications, offering incredibly robust datetime parsing, currency formatting, and deeply nested JSON fallback cascades. 

**However, we explicitly reject `vue-i18n` in favor of `vue3-gettext`.**

### The OpenCloud Submittability Constraint
OpenCloud's core platform is fundamentally architected around the **GNU `gettext`** paradigm (utilizing `.po` and `.pot` dictionary files). When an enterprise user clicks the main OpenCloud "Settings" menu and changes their global application language to "German":
1. OpenCloud's web shell dynamically queries all installed extensions.
2. It expects the extension to natively consume a compiled `gettext` JSON dictionary injection.
3. The `@opencloud-eu/extension-sdk` automatically wires this state injection directly into `vue3-gettext`'s `$gettext()` engine.

If this module circumvented the SDK and implemented `vue-i18n`, the feature voting interface would become entirely disconnected from the parent OpenCloud user session, rendering it non-compliant and instantly rejected during a pull-request review.

---

## 2. Strict Separation of Concerns (Backend vs Frontend)

The language boundary between the Go microservice sidecar and the Vue client is absolute. **The Go API must never attempt to process localization.** 

If an API request fails, the Go sidecar must exclusively return hardcoded, machine-readable exception codes:
```json
{ "error_code": "ERR_VOTE_DUPLICATE" }
```

The Vue frontend is strictly responsible for intercepting these abstract network codes and translating them dynamically for the user:
```typescript
if (response.error_code === 'ERR_VOTE_DUPLICATE') {
    ui.toastError($gettext('You have already voted for this feature.'));
}
```

---

## 3. The Hybrid Vue Strategy (Templates vs Composables)

Because `vue3-gettext` relies on an Abstract Syntax Tree (AST) static analyzer to build its `.po` translation files during the build step, developers cannot dynamically abstract physical English strings into global `constants.ts` files (e.g., `BTN_SUBMIT = 'Submit'`). The compiler must physically see the `$gettext('Literal String')` call to extract it.

To keep the codebase DRY and compliant, we enforce a **Hybrid Approach**:

### A. Encapsulated UI Strings (Inside `.vue` Templates)
Strings that only exist visually within a specific component (buttons, modal headers, empty states) should be explicitly wrapped in their physical templates. This preserves Single-File Component encapsulation:
```html
<!-- src/components/VoteButton.vue -->
<button aria-label="Submit Vote">
  {{ $gettext('Vote for this idea') }}
</button>
```

### B. Centralized Hook Mapping (Inside `.ts` Logic)
For strings that are highly reused or dynamic (like API fallback errors and Toast notifications), we instantiate the gettext hook directly inside generic TypeScript functions, outside of the UI:

```typescript
// src/utils/errorResolver.ts
import { useGettext } from 'vue3-gettext';

export function resolveApiError(errorCode: string): string {
    const { $gettext } = useGettext();
    switch (errorCode) {
        case 'ERR_VOTE_DUPLICATE':
            return $gettext('You have already voted for this feature.');
        case 'ERR_TITLE_EMPTY':
            return $gettext('The feature title cannot be empty.');
        default:
            return $gettext('An unknown server error occurred.');
    }
}
```

**CRITICAL REQUIREMENT:** This parsing mandate explicitly encompasses all hidden UI states. Developers must rigorously ensure `$gettext()` is wrapped around dynamic API errors, HTML `title` and `aria-label` tooltips, and floating toast banners.

---

## 4. Advanced `gettext` Features (Drupal Equivalency)
While we sacrifice the date-formatting of `vue-i18n`, `gettext` natively supports enterprise-grade translation mechanics directly imported from the C/PHP (Drupal) era:

### Pluralization
Handles complex grammatical boundaries automatically based on a raw numeric variable:
```html
<!-- English: "1 Vote" vs "2 Votes". Russian: 3 distinct plural boundaries. -->
{{ $ngettext('%{n} vote', '%{n} votes', feature.vote_count) }}
```

### Contextual Overrides
Separates identical English words that carry vastly different translations in other languages:
```html
<!-- Differentiates the month of May from the permission Verb -->
{{ $pgettext('Month Context', 'May') }}
{{ $pgettext('Verb Context', 'May') }}
```

### Variable Interpolation
Injects dynamic data without breaking the string's grammatical fluidity for the translators:
```html
<translate :parameters="{ authorName: feature.user.name }">
   Submitted by %{authorName}
</translate>
```
