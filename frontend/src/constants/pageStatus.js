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
  [PAGE_STATUS.PROOFREAD]: '待审核',
  [PAGE_STATUS.REVIEWING]: '审核中',
  [PAGE_STATUS.APPROVED]: '已通过',
  [PAGE_STATUS.REJECTED]: '已打回'
})

export const PROOFREADER_ACTIVE_STATUSES = Object.freeze([
  PAGE_STATUS.CLAIMED,
  PAGE_STATUS.PROOFREADING,
  PAGE_STATUS.REJECTED
])

export const REVIEWER_ACTIVE_STATUSES = Object.freeze([
  PAGE_STATUS.REVIEWING
])

export const REVIEW_FINISHED_STATUSES = Object.freeze([
  PAGE_STATUS.APPROVED,
  PAGE_STATUS.REJECTED
])

export const PROOFREAD_PROGRESS_STATUSES = Object.freeze([
  PAGE_STATUS.PROOFREAD,
  PAGE_STATUS.REVIEWING,
  PAGE_STATUS.APPROVED
])

export const MAX_ACTIVE_TASKS = 10

export function statusLabel(status) {
  return PAGE_STATUS_LABELS[status] || status || ''
}

export function statusBadgeClass(status) {
  return `badge-${status}`
}

export function statusFilter(statuses) {
  return statuses.map((status) => `status="${status}"`).join(' || ')
}
