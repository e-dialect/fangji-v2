<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/admin" class="nav-link" :class="{ active: route.path === '/admin' }">控制台</RouterLink>
        <RouterLink to="/admin/projects/new" class="nav-link" :class="{ active: route.path === '/admin/projects/new' }">创建项目</RouterLink>
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
