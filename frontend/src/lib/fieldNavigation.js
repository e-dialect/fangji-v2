export function fieldAt(headers, index) {
  return headers[Math.max(0, Math.min(headers.length - 1, index))] || ''
}

export function navigateField(count, index, action) {
  const last = Math.max(0, count - 1)
  if (action === 'next' && index >= last) return { index: last, overview: true }
  const target = action === 'next' ? index + 1 : Number(action)
  return { index: Math.max(0, Math.min(last, Number.isFinite(target) ? target : 0)), overview: false }
}
