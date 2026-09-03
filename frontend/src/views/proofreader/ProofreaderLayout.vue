<template>
  <div>
    <AppNavbar>
      <template #nav-links>
        <RouterLink to="/workspace" class="nav-link">工作台</RouterLink>
        <RouterLink v-if="auth.isPlatformAdmin || auth.hasManagedProjects" to="/admin" class="nav-link">项目管理</RouterLink>
        <RouterLink to="/tasks" class="nav-link" :class="{ active: route.path !== '/tasks/profile' }">校对项目</RouterLink>
        <RouterLink to="/projects" class="nav-link">发现项目</RouterLink>
        <RouterLink to="/tasks/profile" class="nav-link" :class="{ active: route.path === '/tasks/profile' }">个人主页</RouterLink>
      </template>
    </AppNavbar>
    <RouterView />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, RouterView, RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import { useAuthStore } from '@/stores/auth'
const route = useRoute()
const auth = useAuthStore()
onMounted(() => auth.loadAccessContext())
</script>
