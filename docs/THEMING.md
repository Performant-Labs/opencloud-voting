# Theming Guide for OpenCloud Extensions

> **Purpose**: This document captures the theming architecture of the OpenCloud Web
> shell and the patterns that extensions **must** follow to render correctly in both
> light and dark mode. It is based on first-hand debugging and verified against the
> [OpenCloud Design System source](https://github.com/opencloud-eu/web/tree/main/packages/design-system).

---

## 1. OpenCloud Design Token System

OpenCloud Web uses a **Material Design 3 (M3) role-based token system**, published
in the `@opencloud-eu/design-system` package. Tokens are defined as CSS custom
properties on `:root` and `:host`.

### Official Variable Prefix: `--oc-role-*`

The shell defines semantic role tokens — **not** generic color tokens. The naming
convention is:

```
--oc-role-<role>
```

> [!CAUTION]
> OpenCloud does **NOT** define variables like `--oc-color-text-default`,
> `--oc-color-text-muted`, `--oc-color-background-default`, or
> `--oc-color-border`. These names were guessed during initial development and
> DO NOT EXIST in the runtime. Any `var(--oc-color-*, <fallback>)` declaration
> will always resolve to the fallback value, defeating dark mode support.

### Light Mode Tokens (from `defaults.css`)

| Token                                  | Light Value   | Usage                         |
| -------------------------------------- | ------------- | ----------------------------- |
| `--oc-role-surface`                    | `#FFFFFF`     | Card / container backgrounds  |
| `--oc-role-background`                 | `#FFFFFF`     | Page background               |
| `--oc-role-on-surface`                 | `#191C1D`     | Primary text on surfaces      |
| `--oc-role-on-surface-variant`         | `#40484C`     | Secondary / muted text        |
| `--oc-role-on-background`              | `#191C1D`     | Text on page background       |
| `--oc-role-outline`                    | `#70787C`     | Standard borders              |
| `--oc-role-outline-variant`            | `#BFC8CC`     | Subtle / divider borders      |
| `--oc-role-primary`                    | `#00677F`     | Primary accent color          |
| `--oc-role-on-primary`                 | `#FFFFFF`     | Text on primary backgrounds   |
| `--oc-role-primary-container`          | `#B7EAFF`     | Primary container background  |
| `--oc-role-on-primary-container`       | `#001F28`     | Text on primary containers    |
| `--oc-role-secondary`                  | `#20434F`     | Secondary accent              |
| `--oc-role-secondary-container`        | `#CFE6F1`     | Secondary container bg        |
| `--oc-role-on-secondary-container`     | `#071E26`     | Text on secondary containers  |
| `--oc-role-error`                      | `#BA1A1A`     | Error / danger color          |
| `--oc-role-on-error`                   | `#FFFFFF`     | Text on error backgrounds     |
| `--oc-role-error-container`            | `#FFDAD6`     | Error container bg            |
| `--oc-role-on-error-container`         | `#410002`     | Text on error containers      |
| `--oc-role-tertiary`                   | `#5A5C7E`     | Tertiary accent               |
| `--oc-role-surface-container`          | `#F6F8FA`     | Elevated surface bg           |
| `--oc-role-surface-container-high`     | `#F2F4F5`     | Higher-elevation surface      |
| `--oc-role-surface-container-highest`  | `#ECEEF0`     | Highest-elevation surface     |
| `--oc-role-surface-container-low`      | `#FBFCFE`     | Lower-elevation surface       |
| `--oc-role-surface-dim`               | `#D8DADC`     | Dimmed surface                |
| `--oc-role-scrim`                      | `#000000`     | Overlay / scrim               |
| `--oc-role-shadow`                     | `#000000`     | Shadow color                  |
| `--oc-role-chrome`                     | `#20434F`     | Shell chrome (header/sidebar) |
| `--oc-role-on-chrome`                  | `#FFFFFF`     | Text on chrome                |
| `--oc-role-inverse-surface`            | `#2E3132`     | Inverse surface (e.g. toast)  |
| `--oc-role-inverse-on-surface`         | `#EFF1F2`     | Text on inverse surface       |
| `--oc-role-inverse-primary`            | `#5CD5FB`     | Primary on inverse surface    |

### Other Tokens

| Token                     | Value                                  | Usage               |
| ------------------------- | -------------------------------------- | -------------------- |
| `--oc-font-family`        | `OpenCloud, Inter, sans-serif`         | Default font stack   |
| `--oc-role-surface-tint`  | `#715289`                              | Surface tint overlay |

In **dark mode**, the OpenCloud shell swaps these values automatically (e.g.
`--oc-role-surface` becomes a dark color, `--oc-role-on-surface` becomes light).
Extensions that reference these tokens will adapt to the theme without any
additional code.

---

## 2. The Golden Rule

> [!IMPORTANT]
> **Never hardcode light or dark color values.** Always use `inherit`,
> `currentColor`, or the `--oc-role-*` tokens. Any hardcoded hex value will
> break in one of the two themes.

### Safe Patterns

```css
/* ✅ CORRECT: Inherits text color from the shell, adapts to any theme */
.my-text {
  color: inherit;
}

/* ✅ CORRECT: Uses official tokens — adapts automatically */
.my-card {
  background: var(--oc-role-surface);
  color: var(--oc-role-on-surface);
  border: 1px solid var(--oc-role-outline-variant);
}

/* ✅ CORRECT: Muted text using opacity on the inherited color */
.my-muted-text {
  color: inherit;
  opacity: 0.6;
}

/* ✅ CORRECT: Primary interactive elements */
.my-button {
  background: var(--oc-role-primary);
  color: var(--oc-role-on-primary);
}
```

### Broken Patterns

```css
/* ❌ WRONG: Hardcoded dark text — invisible on dark backgrounds */
.my-text {
  color: #111827;
}

/* ❌ WRONG: Nonexistent variable, fallback always wins */
.my-text {
  color: var(--oc-color-text-default, #111827);
}

/* ❌ WRONG: Hardcoded white background — forces light mode */
.my-card {
  background: #fff;
}

/* ❌ WRONG: Nonexistent variable, white fallback always wins */
.my-card {
  background: var(--oc-color-background-default, #fff);
}
```

---

## 3. Our Current Approach (Hybrid: Tokens + Inheritance)

We use a **hybrid strategy**: direct `--oc-role-*` tokens for semantic colors
(primary, error, borders) and `inherit` + `opacity` for general text, where
the shell already provides the correct inherited color.

| Element Type          | CSS Pattern                              | Why                                   |
| --------------------- | ---------------------------------------- | ------------------------------------- |
| Primary text          | `color: inherit`                         | Gets the shell's on-surface color     |
| Muted / secondary     | `color: inherit; opacity: 0.6`           | Reduced-contrast variant              |
| Very muted (meta)     | `color: inherit; opacity: 0.5`           | Even lower contrast                   |
| Backgrounds (cards)   | `var(--oc-role-surface, transparent)`    | Uses token, falls back to inherit     |
| Borders               | `var(--oc-role-outline-variant, #BFC8CC)` | Uses official border token           |
| Primary buttons       | `background: var(--oc-role-primary, #00677F)` | Official primary accent         |
| Primary button text   | `color: var(--oc-role-on-primary, #fff)` | Semantic text-on-primary pairing      |
| Hover states          | `filter: brightness(0.85)`               | Darkens primary without a second token |
| Error banner bg       | `var(--oc-role-error-container, #FFDAD6)` | Semantic error container             |
| Error text / border   | `var(--oc-role-error, #BA1A1A)`          | Semantic error color                  |
| Error button text     | `var(--oc-role-on-error, #fff)`          | Semantic text-on-error pairing        |
| Muted surfaces        | `var(--oc-role-surface-container, #F6F8FA)` | Elevated surface background       |
| Active/selected       | `var(--oc-role-primary-container, #B7EAFF)` | Primary container for highlights  |
| Search focus ring     | `border-color: var(--oc-role-primary)`   | Focus indicator                       |

### Variable Migration Map

During development, invented `--oc-color-*` variable names were used.
They have all been replaced:

| Old (Invented — DO NOT USE)              | New (Official)                           |
| ---------------------------------------- | ---------------------------------------- |
| `--oc-color-text-default`                | `inherit`                                |
| `--oc-color-text-muted`                  | `inherit` + `opacity: 0.6`              |
| `--oc-color-background-default`          | `--oc-role-surface`                      |
| `--oc-color-background-muted`            | `--oc-role-surface-container`            |
| `--oc-color-border`                      | `--oc-role-outline-variant`              |
| `--oc-color-swatch-primary-default`      | `--oc-role-primary`                      |
| `--oc-color-swatch-primary-hover`        | `--oc-role-primary` + `filter: brightness(0.85)` |
| `--oc-color-swatch-primary-muted`        | `--oc-role-primary-container`            |
| `--oc-color-swatch-danger-default`       | `--oc-role-error`                        |
| `--oc-color-swatch-danger-muted`         | `--oc-role-error-container`              |

---

## 4. Layout Constraints

The OpenCloud shell imposes layout constraints that extensions must respect:

| Constraint        | Detail                                                      |
| ----------------- | ----------------------------------------------------------- |
| `overflow: hidden` | Applied to all ancestor containers above the extension      |
| Fixed shell       | The shell provides a fixed-height viewport for extensions   |
| No page scrolling | The page itself does NOT scroll; extensions must scroll internally |

### Required Container CSS

```css
.fv-container {
  height: 100%;
  overflow-y: auto;       /* Extension scrolls within its allocated space */
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
```

---

## 5. Files Affected

All CSS across these files now uses only `--oc-role-*` tokens or `inherit`:

| File                                        | Changes                                         |
| ------------------------------------------- | ------------------------------------------------ |
| `web/src/App.vue`                           | ~38 properties migrated to `--oc-role-*` tokens  |
| `web/src/NewFeature.vue`                    | ~15 properties migrated to `--oc-role-*` tokens  |
| `web/src/components/Breadcrumbs.vue`        | 3 color properties → `inherit` + `--oc-role-*`   |

Zero `--oc-color-*` references remain. Zero bare `#fff` or hardcoded hex
values outside of token fallbacks.

---

## 6. Testing Theming

To verify theming works:

1. Log in to OpenCloud at `https://cloud.opencloud.test`
2. Click your avatar → **Preferences**
3. Switch the **Theme** dropdown between **Light Theme** and **Dark Theme**
4. Navigate to **Feature Voting** → **Board**
5. Verify:
   - All text is readable against the background
   - Breadcrumbs ("Home > Feature Voting") are visible
   - Feature card titles, descriptions, dates, and comment badges are legible
   - Vote counts and buttons are visible
   - The search input placeholder and text are visible
   - Scrolling works (content is not clipped)

---

## 7. References

- [OpenCloud Design System (GitHub)](https://github.com/opencloud-eu/web/tree/main/packages/design-system)
- [defaults.css — Light mode token definitions](https://github.com/opencloud-eu/web/blob/main/packages/design-system/src/styles/defaults.css)
- [`@opencloud-eu/design-system` on npm](https://www.npmjs.com/package/@opencloud-eu/design-system)
- [OpenCloud Web Documentation](https://docs.opencloud.eu/)
- [Material Design 3 Color Roles](https://m3.material.io/styles/color/roles)

---

## 8. Future Improvements

- **Surface elevation hierarchy**: Replace `inherit` text colors with explicit
  `--oc-role-on-surface` and `--oc-role-on-surface-variant` to eliminate
  `opacity` hacks and gain Material Design 3 surface elevation hierarchy.
- **Icon coloring**: File-type icon tokens (`--oc-color-icon-*`) are available
  and could be used if we add file-type badges to features.
- **Custom theming**: The `theme.json` file allows admins to override tokens
  via the `WEB_ASSET_THEMES_PATH` environment variable. Our extension will
  automatically respect any custom branding.
