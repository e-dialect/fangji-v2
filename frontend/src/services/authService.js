import pb from '@/lib/pocketbase'
import { shouldClearAuthAfterRefreshError } from '@/lib/authRefresh'

export function currentUserId(fallbackUser = null) {
  return pb.authStore.model?.id || fallbackUser?.id || null
}

export function currentUserRole(fallbackUser = null) {
  return pb.authStore.model?.role || fallbackUser?.role || null
}

export async function loginWithPassword(identity, password) {
  return pb.collection('users').authWithPassword(identity, password)
}

export async function refreshStoredAuth() {
  if (!pb.authStore.isValid) return null
  try {
    return await pb.collection('users').authRefresh({ requestKey: null })
  } catch (error) {
    if (shouldClearAuthAfterRefreshError(error)) pb.authStore.clear()
    return null
  }
}

export async function registerProofreader({ email, password, passwordConfirm, name }) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm,
    name,
    role: 'user'
  }, { requestKey: null })
}

export async function changeInitialPassword({ currentPassword, newPassword, newPasswordConfirm }) {
  return pb.send('/api/fangji/auth/change-initial-password', {
    method: 'POST',
    body: { currentPassword, newPassword, newPasswordConfirm },
    requestKey: null
  })
}

export function clearAuth() {
  pb.authStore.clear()
}
