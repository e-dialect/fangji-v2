import { PAGE_STATUS } from '@/constants/pageStatus'
import { listAllPages } from '@/services/pagesService'

function ensureStats(statsByUser, userId) {
  if (!statsByUser.has(userId)) {
    statsByUser.set(userId, {
      userId,
      projectIds: new Set(),
      proofreadCount: 0,
      correctCount: 0
    })
  }
  return statsByUser.get(userId)
}

function addParticipation(statsByUser, userId, page, { completed = false } = {}) {
  if (!userId) return
  const stats = ensureStats(statsByUser, userId)
  if (page.project) stats.projectIds.add(page.project)
  if (completed) stats.proofreadCount += 1
  if (completed && page.status === PAGE_STATUS.APPROVED) stats.correctCount += 1
}

function toProfileStats(stats) {
  const accuracy = stats.proofreadCount
    ? Math.round((stats.correctCount / stats.proofreadCount) * 1000) / 10
    : 0

  return {
    userId: stats.userId,
    projectCount: stats.projectIds.size,
    proofreadCount: stats.proofreadCount,
    correctCount: stats.correctCount,
    accuracy
  }
}

function rankOf(list, userId, compare) {
  const sorted = [...list].sort(compare)
  const index = sorted.findIndex((item) => item.userId === userId)
  if (index < 0) return null

  let rank = 1
  for (let i = 1; i <= index; i += 1) {
    if (compare(sorted[i - 1], sorted[i]) !== 0) rank = i + 1
  }
  return rank
}

export async function getProofreaderProfileStats(userId) {
  if (!userId) throw new Error('缺少校对员身份')

  const pages = await listAllPages({
    fields: [
      'id',
      'project',
      'status',
      'proofreader',
      'first_proofreader',
      'second_proofreader'
    ].join(',')
  })

  const statsByUser = new Map()
  ensureStats(statsByUser, userId)

  for (const page of pages) {
    addParticipation(statsByUser, page.proofreader, page)
    addParticipation(statsByUser, page.first_proofreader, page, { completed: true })
    addParticipation(statsByUser, page.second_proofreader, page, { completed: true })
  }

  const profiles = [...statsByUser.values()].map(toProfileStats)
  const current = profiles.find((item) => item.userId === userId) || toProfileStats(ensureStats(statsByUser, userId))

  const accuracyRank = rankOf(
    profiles,
    userId,
    (a, b) => (b.accuracy - a.accuracy) || (b.proofreadCount - a.proofreadCount) || a.userId.localeCompare(b.userId)
  )
  const proofreadRank = rankOf(
    profiles,
    userId,
    (a, b) => (b.proofreadCount - a.proofreadCount) || (b.accuracy - a.accuracy) || a.userId.localeCompare(b.userId)
  )

  return {
    ...current,
    accuracyRank,
    proofreadRank,
    rankedProofreaderCount: profiles.length
  }
}
