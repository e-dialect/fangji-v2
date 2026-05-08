import pb from '@/lib/pocketbase'
import {
  CLAIMABLE_PROOFREAD_STATUSES,
  PAGE_STATUS,
  PROOFREADER_ACTIVE_STATUSES,
  statusFilter
} from '@/constants/pageStatus'
import { listProjects } from '@/services/projectsService'

function relationFilter(field, id) {
  return `${field}="${id}"`
}

function compactOptions(options) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined && value !== '')
  )
}

export async function listPagesWithFallback({ page = 1, perPage = 50, filter, sort, expand, fields }) {
  const baseOptions = compactOptions({
    filter,
    sort,
    fields,
    requestKey: null
  })
  try {
    return await pb.collection('pages').getList(page, perPage, {
      ...baseOptions,
      expand
    })
  } catch (firstError) {
    if (!expand) throw firstError
    try {
      return await pb.collection('pages').getList(page, perPage, baseOptions)
    } catch (secondError) {
      throw secondError || firstError
    }
  }
}

export async function countPages(filter) {
  const result = await pb.collection('pages').getList(1, 1, {
    filter,
    fields: 'id',
    requestKey: null
  })
  return Number(result.totalItems || 0)
}

export async function listPendingProofreadTasks(page, perPage) {
  return listPagesWithFallback({
    page,
    perPage,
    filter: `status="${PAGE_STATUS.PENDING}"`,
    sort: 'page_number',
    expand: 'project',
    fields: 'id,page_number,pdf_page,project,status,expand.project.id,expand.project.name'
  })
}

export async function listProjectQueueSummaries(userId) {
  const [projects, pages] = await Promise.all([
    listProjects({ sort: 'name' }),
    listAllPages({
      fields: [
        'id',
        'project',
        'status',
        'page_number',
        'pdf_page',
        'proofreader',
        'first_proofreader',
        'mismatch_count'
      ].join(',')
    })
  ])

  const statsByProject = Object.fromEntries(projects.map((project) => [project.id, {
    project,
    total: 0,
    firstPassPending: 0,
    secondPassPending: 0,
    activeMine: 0,
    completed: 0,
    mismatchCount: 0,
    nextPage: null
  }]))

  for (const page of pages) {
    const stats = statsByProject[page.project]
    if (!stats) continue
    stats.total += 1
    stats.mismatchCount += Number(page.mismatch_count || 0)
    if (page.status === PAGE_STATUS.APPROVED) {
      stats.completed += 1
      continue
    }
    if (page.status === PAGE_STATUS.PENDING) {
      stats.firstPassPending += 1
    } else if (page.status === PAGE_STATUS.PROOFREAD) {
      stats.secondPassPending += 1
    }
    if (PROOFREADER_ACTIVE_STATUSES.includes(page.status) && page.proofreader === userId) {
      stats.activeMine += 1
    }
    if (isPageClaimableBy(page, userId)) {
      if (!stats.nextPage || Number(page.page_number) < Number(stats.nextPage.page_number)) {
        stats.nextPage = page
      }
    }
  }

  return Object.values(statsByProject)
    .filter((stats) => stats.total > 0 || stats.project)
    .sort((a, b) => {
      if (b.activeMine !== a.activeMine) return b.activeMine - a.activeMine
      const aClaimable = a.firstPassPending + a.secondPassPending
      const bClaimable = b.firstPassPending + b.secondPassPending
      if (bClaimable !== aClaimable) return bClaimable - aClaimable
      return String(a.project.name || '').localeCompare(String(b.project.name || ''), 'zh-Hans-CN')
    })
}

export async function listProofreaderTasks(userId, page, perPage) {
  return listPagesWithFallback({
    page,
    perPage,
    filter: relationFilter('proofreader', userId),
    sort: '-updated',
    expand: 'project',
    fields: 'id,page_number,pdf_page,project,status,expand.project.id,expand.project.name'
  })
}

export async function countActiveProofreaderTasks(userId) {
  return countPages(`${relationFilter('proofreader', userId)} && (${statusFilter(PROOFREADER_ACTIVE_STATUSES)})`)
}

export async function claimProofreadTask(pageId, userId) {
  return pb.collection('pages').update(pageId, {
    status: PAGE_STATUS.CLAIMED,
    proofreader: userId
  }, { requestKey: null })
}

export async function getPage(pageId, options = {}) {
  return pb.collection('pages').getOne(pageId, {
    requestKey: null,
    ...options
  })
}

export async function updatePage(pageId, data) {
  return pb.collection('pages').update(pageId, data, { requestKey: null })
}

export async function createPage(data) {
  return pb.collection('pages').create(data, { requestKey: null })
}

export async function deletePage(pageId) {
  return pb.collection('pages').delete(pageId, { requestKey: null })
}

export async function listAllProjectPages(projectId, options = {}) {
  return pb.collection('pages').getFullList({
    filter: `project="${projectId}"`,
    sort: 'page_number',
    requestKey: null,
    ...options
  })
}

export async function listAllPages(options = {}) {
  return pb.collection('pages').getFullList({
    requestKey: null,
    ...options
  })
}

export async function getPagedProjectPages(projectId, page, perPage, options = {}) {
  return pb.collection('pages').getList(page, perPage, {
    filter: `project="${projectId}"`,
    sort: 'page_number',
    requestKey: null,
    ...options
  })
}

export async function listProofreaderNeighborTasks(projectId, userId) {
  return pb.collection('pages').getFullList({
    filter: `project="${projectId}" && ${relationFilter('proofreader', userId)} && (${statusFilter(PROOFREADER_ACTIVE_STATUSES)})`,
    sort: 'page_number',
    fields: 'id,page_number',
    requestKey: null
  })
}

export async function claimNextProjectPage(projectId, userId) {
  if (!projectId || !userId) throw new Error('缺少项目或校对员身份')

  const active = await pb.collection('pages').getFullList({
    filter: `project="${projectId}" && ${relationFilter('proofreader', userId)} && (${statusFilter(PROOFREADER_ACTIVE_STATUSES)})`,
    sort: 'page_number',
    fields: pageQueueFields(),
    requestKey: null
  })
  if (active.length) return active[0]

  const candidates = await pb.collection('pages').getFullList({
    filter: `project="${projectId}" && (${statusFilter(CLAIMABLE_PROOFREAD_STATUSES)})`,
    sort: 'page_number',
    fields: pageQueueFields(),
    requestKey: null
  })

  const claimable = candidates.filter((page) => isPageClaimableBy(page, userId))
  for (const page of claimable) {
    try {
      return await claimProofreadTask(page.id, userId)
    } catch {
      // Another proofreader may have claimed this page between list and update.
      // Continue through the ordered queue and surface an error only if none work.
    }
  }

  return null
}

export async function submitTwoPassProofread(pageId, userId, { rowJson, text }) {
  const latest = await getPage(pageId)
  if (!PROOFREADER_ACTIVE_STATUSES.includes(latest.status) || latest.proofreader !== userId) {
    throw new Error('该条目当前不属于你，请返回项目大厅刷新后重试')
  }

  const now = new Date().toISOString()
  const firstProofreader = latest.first_proofreader || ''
  const normalizedCurrent = normalizeProofreadPayload(rowJson, text)

  if (!firstProofreader) {
    return updatePage(pageId, {
      first_proofreader: userId,
      first_proofread_row_json: rowJson,
      first_proofread_text: text,
      first_proofread_at: now,
      second_proofreader: null,
      second_proofread_row_json: '',
      second_proofread_text: '',
      second_proofread_at: null,
      proofread_row_json: rowJson,
      proofread_text: text,
      proofread_at: now,
      status: PAGE_STATUS.PROOFREAD,
      proofreader: null
    })
  }

  if (firstProofreader === userId) {
    throw new Error('第二次校对必须由另一位校对员完成')
  }

  const normalizedFirst = normalizeProofreadPayload(latest.first_proofread_row_json, latest.first_proofread_text)
  if (normalizedFirst === normalizedCurrent) {
    return updatePage(pageId, {
      second_proofreader: userId,
      second_proofread_row_json: rowJson,
      second_proofread_text: text,
      second_proofread_at: now,
      proofread_row_json: rowJson,
      proofread_text: text,
      proofread_at: now,
      status: PAGE_STATUS.APPROVED,
      proofreader: null
    })
  }

  return updatePage(pageId, {
    first_proofreader: null,
    first_proofread_row_json: '',
    first_proofread_text: '',
    first_proofread_at: null,
    second_proofreader: null,
    second_proofread_row_json: '',
    second_proofread_text: '',
    second_proofread_at: null,
    proofread_row_json: '',
    proofread_text: '',
    proofread_at: null,
    proofread_round: Number(latest.proofread_round || 1) + 1,
    mismatch_count: Number(latest.mismatch_count || 0) + 1,
    last_mismatch_at: now,
    status: PAGE_STATUS.PENDING,
    proofreader: null
  })
}

export function isPageClaimableBy(page, userId) {
  if (!page || !userId) return false
  if (page.status === PAGE_STATUS.PENDING) return true
  return page.status === PAGE_STATUS.PROOFREAD && page.first_proofreader !== userId
}

function pageQueueFields() {
  return [
    'id',
    'project',
    'project_file',
    'page_number',
    'pdf_page',
    'status',
    'proofreader',
    'first_proofreader',
    'first_proofread_row_json',
    'first_proofread_text',
    'ocr_row_json',
    'ocr_text'
  ].join(',')
}

function normalizeProofreadPayload(rowJson, text) {
  const parsed = safeParseObject(rowJson)
  if (parsed) return JSON.stringify(sortAndTrimObject(parsed))
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function safeParseObject(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function sortAndTrimObject(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((key) => [key, String(obj[key] ?? '').trim()])
  )
}
