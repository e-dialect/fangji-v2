export function getPbStatus(error) {
  return error?.status || error?.response?.status || null
}

export function getPbMessage(error, fallback = '请求失败，请稍后重试') {
  const response = error?.response
  const details = Object.values(response?.data || {})
    .map((item) => String(item?.message || '').trim())
    .filter(Boolean)

  if (details.length) return details.join('；')

  const responseMessage = String(response?.message || '').trim()
  const genericMessages = new Set([
    'Failed to create record.',
    'Failed to update record.',
    'Failed to delete record.',
    'Failed to authenticate.',
    'Something went wrong while processing your request.'
  ])
  if (responseMessage && !genericMessages.has(responseMessage)) return responseMessage

  const directMessage = String(error?.message || '').trim()
  if (directMessage && !genericMessages.has(directMessage)) return directMessage
  return fallback
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
