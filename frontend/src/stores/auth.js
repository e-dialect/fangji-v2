import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import pb from '@/lib/pocketbase'
import { clearAuth, loginWithPassword, registerProofreader } from '@/services/authService'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(pb.authStore.model)
  const token = ref(pb.authStore.token)

  pb.authStore.onChange((newToken, newModel) => {
    token.value = newToken
    user.value = newModel
  })

  const isLoggedIn = computed(() => pb.authStore.isValid)
  const role = computed(() => user.value?.role || null)
  const isAdmin = computed(() => role.value === 'admin')
  const isProofreader = computed(() => role.value === 'proofreader')
  const isReviewer = computed(() => role.value === 'reviewer')

  async function login(email, password) {
    const authData = await loginWithPassword(email, password)
    user.value = authData.record
    token.value = authData.token
    return authData
  }

  async function register(email, password, passwordConfirm, name) {
    const record = await registerProofreader({
      email,
      password,
      passwordConfirm,
      name
    })
    return record
  }

  function logout() {
    clearAuth()
    user.value = null
    token.value = null
  }

  return { user, token, isLoggedIn, role, isAdmin, isProofreader, isReviewer, login, register, logout }
})
