export const PAGE_STATUS = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  PROOFREADING: 'proofreading',
  PROOFREAD: 'proofread',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected'
})

export const PAGE_STATUS_LABELS = Object.freeze({
  [PAGE_STATUS.PENDING]: '待校对',
  [PAGE_STATUS.CLAIMED]: '已认领',
  [PAGE_STATUS.PROOFREADING]: '校对中',
  [PAGE_STATUS.PROOFREAD]: '待确认',
  [PAGE_STATUS.REVIEWING]: '历史处理中',
  [PAGE_STATUS.APPROVED]: '校对完成',
  [PAGE_STATUS.REJECTED]: '已退回'
})

export const PROOFREADER_ACTIVE_STATUSES = Object.freeze([
  PAGE_STATUS.CLAIMED,
  PAGE_STATUS.PROOFREADING
])

export const PROOFREAD_PROGRESS_STATUSES = Object.freeze([
  PAGE_STATUS.PROOFREAD,
  PAGE_STATUS.APPROVED
])

export const CLAIMABLE_PROOFREAD_STATUSES = Object.freeze([
  PAGE_STATUS.PENDING,
  PAGE_STATUS.PROOFREAD
])

export function statusLabel(status) {
  return PAGE_STATUS_LABELS[status] || status || ''
}

export function statusBadgeClass(status) {
  return `badge-${status}`
}

export function statusFilter(statuses) {
  return statuses.map((status) => `status="${status}"`).join(' || ')
}
