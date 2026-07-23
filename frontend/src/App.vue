<template>
  <AppErrorBoundary>
    <RouterView />
  </AppErrorBoundary>
</template>

<script setup>
import { RouterView } from 'vue-router'
import AppErrorBoundary from '@/components/AppErrorBoundary.vue'
</script>
