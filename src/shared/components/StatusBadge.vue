<script setup lang="ts">
defineProps<{ tone?: 'success' | 'pending' | 'error' | 'neutral' }>();
</script>
<template>
  <span class="status-badge" :data-tone="tone ?? 'neutral'"><slot /></span>
</template>
