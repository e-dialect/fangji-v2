import pb from '@/lib/pocketbase'
import {
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

export async function reorderPendingPages(projectId, orderedIds) {
  return pb.send(`/api/fangji/projects/${encodeURIComponent(projectId)}/pages/reorder`, {
    method: 'POST',
    body: { orderedIds },
    requestKey: null
  })
}

export async function deletePendingPages(projectId, ids) {
  return pb.send(`/api/fangji/projects/${encodeURIComponent(projectId)}/pages/delete-pending`, {
    method: 'POST',
    body: { ids },
    requestKey: null
  })
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
  return pb.send(`/api/fangji/projects/${encodeURIComponent(projectId)}/claim`, {
    method: 'POST',
    requestKey: null
  })
}

export async function submitTwoPassProofread(pageId, userId, { rowJson, text }) {
  if (!pageId || !userId) throw new Error('缺少任务或校对员身份')
  return pb.send(`/api/fangji/pages/${encodeURIComponent(pageId)}/submit`, {
    method: 'POST',
    body: { rowJson, text },
    requestKey: null
  })
}

export function isPageClaimableBy(page, userId) {
  if (!page || !userId) return false
  if (page.status === PAGE_STATUS.PENDING) return true
  return page.status === PAGE_STATUS.PROOFREAD && page.first_proofreader !== userId
}
