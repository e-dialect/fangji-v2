const leaseKeyPrefix = 'fangji:task-lease:v1'

export function taskLeaseKey(userId, pageId) {
  return `${leaseKeyPrefix}:${encodeURIComponent(userId || '')}:${encodeURIComponent(pageId || '')}`
}

export function saveTaskLease(storage, { userId, pageId, token, expiresAt }) {
  if (!storage || !userId || !pageId || !token) return null
  const lease = { token: String(token), expiresAt: String(expiresAt || '') }
  storage.setItem(taskLeaseKey(userId, pageId), JSON.stringify(lease))
  return lease
}

export function loadTaskLease(storage, { userId, pageId }) {
  if (!storage || !userId || !pageId) return null
  try {
    const lease = JSON.parse(storage.getItem(taskLeaseKey(userId, pageId)) || 'null')
    if (!lease || typeof lease.token !== 'string' || lease.token.length < 32) return null
    return { token: lease.token, expiresAt: String(lease.expiresAt || '') }
  } catch {
    return null
  }
}

export function clearTaskLease(storage, { userId, pageId }) {
  if (!storage || !userId || !pageId) return
  storage.removeItem(taskLeaseKey(userId, pageId))
}

export function leaseExpiresSoon(expiresAt, now = Date.now(), thresholdMs = 3 * 60 * 1000) {
  const expiry = new Date(expiresAt).getTime()
  return !Number.isFinite(expiry) || expiry - now <= thresholdMs
}
