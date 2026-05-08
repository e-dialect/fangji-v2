<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/tasks" class="nav-link" :class="{ active: route.path === '/tasks' }">项目大厅</RouterLink>
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
