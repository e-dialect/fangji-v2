import { PAGE_STATUS } from '../constants/pageStatus.js'

function asList(value) {
  return Array.isArray(value) ? value : []
}

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function textValue(value) {
  return String(value ?? '')
}

export function summarizeProofreaderQueues(queues) {
  return asList(queues).reduce((summary, queue) => {
    if (asNumber(queue?.activeMine) > 0) summary.activeProjects += 1
    if (queue?.nextPage) summary.availableProjects += 1
    summary.completedItems += asNumber(queue?.completed)
    summary.totalItems += asNumber(queue?.total)
    return summary
  }, {
    activeProjects: 0,
    availableProjects: 0,
    completedItems: 0,
    totalItems: 0
  })
}

export function proofreadPassLabel(page) {
  return page?.status === PAGE_STATUS.PROOFREAD || page?.first_proofreader ? '二校' : '一校'
}

export function getProofreaderQueueAction(queue) {
  if (asNumber(queue?.activeMine) > 0 && queue?.activePage) {
    return {
      canEnter: true,
      label: '继续校对',
      detail: `继续${proofreadPassLabel(queue.activePage)} · 第 ${asNumber(queue.activePage.page_number) || '—'} 条`,
      tone: 'active'
    }
  }

  if (queue?.nextPage) {
    const pass = proofreadPassLabel(queue.nextPage)
    return {
      canEnter: true,
      label: `领取${pass}`,
      detail: `下一条为${pass} · 第 ${asNumber(queue.nextPage.page_number) || '—'} 条`,
      tone: 'available'
    }
  }

  const total = asNumber(queue?.total)
  const completed = asNumber(queue?.completed)
  if (total > 0 && completed >= total) {
    return {
      canEnter: false,
      label: '项目已完成',
      detail: '全部条目已完成双校或仲裁',
      tone: 'complete'
    }
  }

  return {
    canEnter: false,
    label: '等待新任务',
    detail: '当前没有可由你处理的条目',
    tone: 'waiting'
  }
}

export function getChangedFields(headers, originalRow, editedRow) {
  return asList(headers).filter((header) => {
    return textValue(originalRow?.[header]) !== textValue(editedRow?.[header])
  })
}

export function summarizePages(pages) {
  const summary = {
    total: 0,
    pendingFirst: 0,
    active: 0,
    pendingSecond: 0,
    arbitration: 0,
    approved: 0,
    incomplete: 0,
    completionPct: 0
  }

  for (const page of asList(pages)) {
    summary.total += 1
    if (page?.status === PAGE_STATUS.PENDING) summary.pendingFirst += 1
    if ([PAGE_STATUS.CLAIMED, PAGE_STATUS.PROOFREADING].includes(page?.status)) summary.active += 1
    if (page?.status === PAGE_STATUS.PROOFREAD) summary.pendingSecond += 1
    if (page?.status === PAGE_STATUS.ARBITRATION) summary.arbitration += 1
    if (page?.status === PAGE_STATUS.APPROVED) summary.approved += 1
  }

  summary.incomplete = Math.max(0, summary.total - summary.approved)
  summary.completionPct = summary.total
    ? Math.round((summary.approved / summary.total) * 100)
    : 0
  return summary
}

export function sortProjectInsights(projects) {
  return asList(projects)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const arbitrationDelta = asNumber(right.item?.summary?.arbitration) - asNumber(left.item?.summary?.arbitration)
      if (arbitrationDelta) return arbitrationDelta
      const incompleteDelta = asNumber(right.item?.summary?.incomplete) - asNumber(left.item?.summary?.incomplete)
      return incompleteDelta || left.index - right.index
    })
    .map(({ item }) => item)
}

export function getDifferingHeaders(headers, firstRow, secondRow) {
  return asList(headers).filter((header) => {
    return textValue(firstRow?.[header]) !== textValue(secondRow?.[header])
  })
}
