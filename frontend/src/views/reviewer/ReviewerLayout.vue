<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/review" class="nav-link" :class="{ active: route.path === '/review' }">审核大厅</RouterLink>
      </template>
    </AppNavbar>
    <RouterView />
  </div>
</template>

<script setup>
import { useRoute, RouterView, RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
const route = useRoute()
</script>
