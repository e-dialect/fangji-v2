<template>
  <nav class="navbar">
    <div class="container">
      <RouterLink to="/" class="navbar-brand">
        📚 方辑
        <span class="sub">线上方言校对工坊</span>
      </RouterLink>
      <div class="navbar-nav">
        <slot name="nav-links" />
        <span class="text-sm text-muted" style="margin-right:.5rem">{{ auth.user?.name || auth.user?.email }}</span>
        <button class="btn btn-secondary btn-sm" @click="handleLogout">登出</button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>
