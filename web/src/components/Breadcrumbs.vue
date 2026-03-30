<script setup lang="ts">
// eslint-disable-next-line vue/multi-word-component-names
defineOptions({ name: 'Breadcrumbs' })

export interface BreadcrumbItem {
  label: string
  to?: string
}

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <nav class="fv-breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(item, index) in items" :key="index">
        <template v-if="item.to && index !== items.length - 1">
          <router-link :to="item.to" class="fv-breadcrumb-link">
            {{ item.label }}
          </router-link>
          <svg
            class="fv-breadcrumb-separator"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </template>
        <span v-else class="fv-breadcrumb-current" aria-current="page">
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.fv-breadcrumbs {
  margin-bottom: 20px;
}
.fv-breadcrumbs ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.fv-breadcrumbs li {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.fv-breadcrumb-link {
  color: var(--oc-color-text-muted, #6b7280);
  text-decoration: none;
  transition: color 0.15s ease;
}
.fv-breadcrumb-link:hover {
  color: var(--oc-color-swatch-primary-default, #6366f1);
}
.fv-breadcrumb-separator {
  color: var(--oc-color-text-muted, #9ca3af);
  margin-left: 8px;
  stroke-width: 2.5;
  opacity: 0.6;
}
.fv-breadcrumb-current {
  color: var(--oc-color-text-default, #111827);
  cursor: default;
}

</style>
