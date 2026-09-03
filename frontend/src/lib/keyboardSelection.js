export function keyboardPreferenceKey(userId, projectId) {
  return `fangji:keyboard:${encodeURIComponent(userId || 'anonymous')}:${encodeURIComponent(projectId || '')}`
}

export function chooseProjectKeyboard(items, defaultKeyboardId, rememberedKeyboardId) {
  if (!Array.isArray(items) || items.length === 0) return null
  const remembered = items.find((item) => item.keyboardId === rememberedKeyboardId)
  if (remembered) return remembered
  const projectDefault = items.find((item) => item.keyboardId === defaultKeyboardId)
  return projectDefault || items[0]
}
