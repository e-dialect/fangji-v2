// One in-memory preview per mounted workspace. Authorization is checked through
// the descriptor API before every lookup; the cache itself never grants access.
export function createPdfPreviewCache({ now = Date.now, urls = URL } = {}) {
  let entry = null
  function clear() { if (entry) urls.revokeObjectURL(entry.url); entry = null }
  return {
    clear,
    get(userId, descriptor) {
      return entry?.userId === userId && entry.key === descriptor.key && entry.expires > now() && Date.parse(descriptor.expiresAt) > now() ? entry : null
    },
    put(userId, descriptor, blob) {
      clear()
      entry = { userId, key: descriptor.key, expires: Date.parse(descriptor.expiresAt), url: urls.createObjectURL(blob) }
      return entry
    }
  }
}
