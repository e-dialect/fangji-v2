export function getPbStatus(error) {
  return error?.status || error?.response?.status || null
}

export function getPbMessage(error, fallback = '请求失败，请稍后重试') {
  return error?.response?.message || error?.message || fallback
}

export function formatPbError(prefix, error) {
  const status = getPbStatus(error)
  const message = getPbMessage(error, '')
  if (status) return `${prefix}（${status}）：${message || '请求失败'}`
  return message ? `${prefix}：${message}` : `${prefix}，请稍后重试`
}

export function formatClaimConflict(error, fallback) {
  const status = getPbStatus(error)
  const message = getPbMessage(error, '')
  if (status === 400 || status === 409) {
    return message || fallback
  }
  if (status === 401) return '登录状态已失效，请重新登录'
  if (status === 403) return '当前账号无权执行该操作'
  return message || fallback
}
