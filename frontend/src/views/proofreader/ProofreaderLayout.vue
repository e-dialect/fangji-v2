<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/tasks" class="nav-link" :class="{ active: route.path !== '/tasks/profile' }">校对项目</RouterLink>
        <RouterLink to="/tasks/profile" class="nav-link" :class="{ active: route.path === '/tasks/profile' }">个人主页</RouterLink>
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
