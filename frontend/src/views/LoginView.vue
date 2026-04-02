<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-logo">
        <h1>方辑</h1>
        <p>线上方言校对工坊</p>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input
            v-model.trim="email"
            type="email"
            class="form-control"
            placeholder="请输入邮箱"
            autocomplete="email"
            :disabled="loading"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            class="form-control"
            placeholder="请输入密码"
            autocomplete="current-password"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <button
          type="submit"
          class="btn btn-primary btn-block btn-lg"
          :disabled="loading || !canSubmit"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <p class="text-center mt-4 text-sm text-muted">
        还没有账号？
        <RouterLink to="/register">立即注册</RouterLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits(['close'])

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const canSubmit = computed(() => email.value.trim() && password.value)

function getRoleHome() {
  if (auth.isAdmin) return '/admin'
  if (auth.isProofreader) return '/tasks'
  if (auth.isReviewer) return '/review'
  return '/'
}

async function redirectAfterLogin() {
  const target = typeof route.query.redirect === 'string' && route.query.redirect
    ? route.query.redirect
    : getRoleHome()

  emit('close')

  if (router.currentRoute.value.fullPath !== target) {
    await router.push(target)
  }
}

onMounted(async () => {
  if (auth.isLoggedIn) {
    await redirectAfterLogin()
  }
})

async function handleLogin() {
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    await auth.login(email.value.trim(), password.value)
    password.value = ''
    await redirectAfterLogin()
  } catch (e) {
    error.value = e?.response?.message || '登录失败，请检查邮箱和密码'
  } finally {
    loading.value = false
  }
}
</script>
