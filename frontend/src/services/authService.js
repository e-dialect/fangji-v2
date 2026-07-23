import pb from '@/lib/pocketbase'

export function currentUserId(fallbackUser = null) {
  return pb.authStore.model?.id || fallbackUser?.id || null
}

export function currentUserRole(fallbackUser = null) {
  return pb.authStore.model?.role || fallbackUser?.role || null
}

export async function loginWithPassword(email, password) {
  return pb.collection('users').authWithPassword(email, password)
}

export async function refreshStoredAuth() {
  if (!pb.authStore.isValid) return null
  try {
    return await pb.collection('users').authRefresh({ requestKey: null })
  } catch {
    pb.authStore.clear()
    return null
  }
}

export async function registerProofreader({ email, password, passwordConfirm, name }) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm,
    name,
    role: 'proofreader'
  }, { requestKey: null })
}

export function clearAuth() {
  pb.authStore.clear()
}
