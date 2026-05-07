import pb from '@/lib/pocketbase'
import {
  PAGE_STATUS,
  PROOFREADER_ACTIVE_STATUSES,
  REVIEWER_ACTIVE_STATUSES,
  statusFilter
} from '@/constants/pageStatus'

function relationFilter(field, id) {
  return `${field}="${id}"`
}

export async function listPagesWithFallback({ page = 1, perPage = 50, filter, sort, expand, fields }) {
  const baseOptions = {
    filter,
    sort,
    fields,
    requestKey: null
  }
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
    expand: 'project'
  })
}

export async function listProofreaderTasks(userId, page, perPage) {
  return listPagesWithFallback({
    page,
    perPage,
    filter: relationFilter('proofreader', userId),
    sort: '-updated',
    expand: 'project'
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

export async function listPendingReviewTasks(page, perPage) {
  return listPagesWithFallback({
    page,
    perPage,
    filter: `status="${PAGE_STATUS.PROOFREAD}"`,
    sort: 'page_number',
    expand: 'project,proofreader'
  })
}

export async function listReviewerTasks(userId, page, perPage) {
  return listPagesWithFallback({
    page,
    perPage,
    filter: relationFilter('reviewer', userId),
    sort: '-updated',
    expand: 'project'
  })
}

export async function countActiveReviewerTasks(userId) {
  return countPages(`${relationFilter('reviewer', userId)} && (${statusFilter(REVIEWER_ACTIVE_STATUSES)})`)
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

export async function listReviewerNeighborTasks(projectId, userId) {
  const filter = userId
    ? `project="${projectId}" && (status="${PAGE_STATUS.PROOFREAD}" || (status="${PAGE_STATUS.REVIEWING}" && ${relationFilter('reviewer', userId)}))`
    : `project="${projectId}" && status="${PAGE_STATUS.PROOFREAD}"`
  return pb.collection('pages').getFullList({
    filter,
    sort: 'page_number',
    fields: 'id,page_number',
    requestKey: null
  })
}
