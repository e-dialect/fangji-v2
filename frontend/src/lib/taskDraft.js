const DRAFT_PREFIX = 'fangji:task-draft:v1'
const FLASH_KEY = 'fangji:task-flash:v1'

export function taskDraftKey(userId, pageId) {
  return `${DRAFT_PREFIX}:${String(userId || '')}:${String(pageId || '')}`
}

export function saveTaskDraft(storage, { userId, pageId, sourceSignature, row, savedAt = new Date().toISOString() }) {
  if (!storage || !userId || !pageId || !sourceSignature || !row) return null
  const payload = {
    version: 1,
    userId: String(userId),
    pageId: String(pageId),
    sourceSignature: String(sourceSignature),
    row,
    savedAt
  }
  storage.setItem(taskDraftKey(userId, pageId), JSON.stringify(payload))
  return payload
}

export function loadTaskDraft(storage, { userId, pageId, sourceSignature }) {
  if (!storage || !userId || !pageId || !sourceSignature) return null
  const key = taskDraftKey(userId, pageId)
  const raw = storage.getItem(key)
  if (!raw) return null

  try {
    const draft = JSON.parse(raw)
    if (
      draft?.version !== 1 ||
      draft.userId !== String(userId) ||
      draft.pageId !== String(pageId) ||
      draft.sourceSignature !== String(sourceSignature) ||
      !draft.row ||
      Array.isArray(draft.row) ||
      typeof draft.row !== 'object'
    ) {
      storage.removeItem(key)
      return null
    }
    return draft
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function clearTaskDraft(storage, { userId, pageId }) {
  if (!storage || !userId || !pageId) return
  storage.removeItem(taskDraftKey(userId, pageId))
}

export function setTaskFlash(storage, message) {
  if (!storage || !message) return
  storage.setItem(FLASH_KEY, String(message))
}

export function takeTaskFlash(storage) {
  if (!storage) return ''
  const message = storage.getItem(FLASH_KEY) || ''
  storage.removeItem(FLASH_KEY)
  return message
}
