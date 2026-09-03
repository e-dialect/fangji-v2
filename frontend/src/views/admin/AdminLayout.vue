<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/admin" class="nav-link" :class="{ active: isProjectWorkspace }">项目总览</RouterLink>
        <RouterLink to="/admin/projects/new" class="nav-link" :class="{ active: route.path === '/admin/projects/new' }">新建项目</RouterLink>
      </template>
    </AppNavbar>
    <RouterView />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, RouterView, RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
const route = useRoute()
const isProjectWorkspace = computed(() => route.path === '/admin' || (route.path.startsWith('/admin/projects/') && route.path !== '/admin/projects/new'))
</script>
