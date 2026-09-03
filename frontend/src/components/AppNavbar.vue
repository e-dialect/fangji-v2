<template>
  <nav class="navbar" aria-label="主导航">
    <div class="container">
      <RouterLink to="/" class="navbar-brand">
        <span class="navbar-seal" aria-hidden="true">方</span>
        <span>方辑</span>
        <span class="sub">线上方言校对工坊</span>
      </RouterLink>
      <div class="navbar-nav">
        <slot name="nav-links" />
        <span class="navbar-divider" aria-hidden="true"></span>
        <span class="navbar-user" :title="auth.user?.email">
          <span class="navbar-avatar" aria-hidden="true">{{ userInitial }}</span>
          <span>{{ auth.user?.name || auth.user?.email }}</span>
        </span>
        <button class="btn btn-quiet btn-sm" @click="handleLogout">退出</button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const userInitial = computed(() => String(auth.user?.name || auth.user?.email || '校').slice(0, 1).toLocaleUpperCase('zh-CN'))

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>
