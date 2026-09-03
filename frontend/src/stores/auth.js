import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import pb from '@/lib/pocketbase'
import { clearAuth, loginWithExternalProvider, loginWithPassword, registerProofreader } from '@/services/authService'
import { getAccessContext } from '@/services/projectsService'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(pb.authStore.model)
  const token = ref(pb.authStore.token)
  const accessContext = ref(null)
  let accessRequest = null

  pb.authStore.onChange((newToken, newModel) => {
    token.value = newToken
    user.value = newModel
    if (!newToken) accessContext.value = null
  })

  const isLoggedIn = computed(() => pb.authStore.isValid)
  const role = computed(() => user.value?.role || null)
  const isPlatformAdmin = computed(() => role.value === 'platform_admin')
  const isAdmin = isPlatformAdmin
  const isProofreader = computed(() => Boolean(accessContext.value?.proofreadingProjectIds?.length))
  const canCreateProjects = computed(() => Boolean(accessContext.value?.canCreateProjects))
  const hasManagedProjects = computed(() => Boolean(accessContext.value?.managedProjectIds?.length))
  const hasProofreadingProjects = computed(() => Boolean(accessContext.value?.proofreadingProjectIds?.length))
  const mustChangePassword = computed(() => Boolean(user.value?.must_change_password))

  async function loadAccessContext({ force = false } = {}) {
    if (!pb.authStore.isValid) {
      accessContext.value = null
      return null
    }
    if (accessContext.value && !force) return accessContext.value
    if (accessRequest && !force) return accessRequest
    accessRequest = getAccessContext()
      .then((context) => {
        accessContext.value = context
        return context
      })
      .finally(() => {
        accessRequest = null
      })
    return accessRequest
  }

  async function login(email, password) {
    const authData = await loginWithPassword(email, password)
    user.value = authData.record
    token.value = authData.token
    await loadAccessContext({ force: true })
    return authData
  }

  async function loginExternal(provider, identity, password) {
    const authData = await loginWithExternalProvider(provider, identity, password)
    user.value = authData.record
    token.value = authData.token
    await loadAccessContext({ force: true })
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
    accessContext.value = null
  }

  return {
    user,
    token,
    accessContext,
    isLoggedIn,
    role,
    isAdmin,
    isProofreader,
    isPlatformAdmin,
    canCreateProjects,
    hasManagedProjects,
    hasProofreadingProjects,
    mustChangePassword,
    loadAccessContext,
    login,
    loginExternal,
    register,
    logout
  }
})
