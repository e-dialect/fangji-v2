const assert = require('node:assert/strict')
const test = require('node:test')

const {
  cleanupExpiredProjectJoinAttempts,
  projectJoinAttemptExpired,
  projectJoinBlocked,
  projectJoinSourceAttempt,
  recordProjectJoinSourceFailure
} = require('../pb_hooks/lib/project_access.js')

const minute = 60 * 1000
const hour = 60 * minute
const day = 24 * hour

function dateTime(milliseconds) {
  return {
    isZero: () => !milliseconds,
    time: () => ({ unixMilli: () => milliseconds })
  }
}

function attempt(id, windowStarted, blockedUntil = 0) {
  return {
    id,
    getDateTime: (field) => dateTime(field === 'window_started' ? windowStarted : blockedUntil)
  }
}

function fakeDao(recordsByCollection) {
  const deleted = []
  const queries = []
  return {
    deleted,
    queries,
    findRecordsByFilter(collection, filter, sort, limit, offset) {
      queries.push({ collection, filter, sort, limit, offset })
      return recordsByCollection[collection] || []
    },
    deleteRecord(record) {
      deleted.push(record.id)
    }
  }
}

class MutableAttempt {
  constructor() {
    this.values = {}
  }

  getDateTime(field) {
    const value = this.values[field]
    return dateTime(value ? Date.parse(value) : 0)
  }

  getInt(field) {
    return Number(this.values[field] || 0)
  }

  getString(field) {
    return String(this.values[field] || '')
  }

  set(field, value) {
    this.values[field] = value
  }
}

global.Record = MutableAttempt

function sourceAttemptDao() {
  const records = []
  return {
    findCollectionByNameOrId: () => ({}),
    findRecordsByFilter(collection, filter) {
      if (collection !== 'project_join_source_attempts') return []
      const projectId = filter.match(/project = "([^"]+)"/)?.[1]
      const sourceKey = filter.match(/source_key = "([^"]+)"/)?.[1]
      return records.filter((record) => (
        record.getString('project') === projectId && record.getString('source_key') === sourceKey
      ))
    },
    saveRecord(record) {
      if (!records.includes(record)) records.push(record)
    }
  }
}

test('attempt expiry retains active windows and active blocks', () => {
  const now = 100 * day
  assert.equal(projectJoinAttemptExpired(attempt('fresh', now - minute), now), false)
  assert.equal(projectJoinAttemptExpired(attempt('blocked', now - 2 * day, now + minute), now), false)
  assert.equal(projectJoinAttemptExpired(attempt('old', now - day - 16 * minute), now), true)
})

test('cleanup deletes only expired user and source records in bounded batches', () => {
  const now = 100 * day
  const dao = fakeDao({
    project_join_attempts: [
      attempt('old-user', now - day - 16 * minute),
      attempt('fresh-user', now - minute)
    ],
    project_join_source_attempts: [
      attempt('old-source', now - day - 16 * minute),
      attempt('blocked-source', now - 2 * day, now + minute)
    ]
  })

  const deleted = cleanupExpiredProjectJoinAttempts(dao, now, 50)

  assert.equal(deleted, 2)
  assert.deepEqual(dao.deleted, ['old-user', 'old-source'])
  assert.deepEqual(
    dao.queries.map(({ collection, sort, limit, offset }) => ({ collection, sort, limit, offset })),
    [
      { collection: 'project_join_attempts', sort: 'window_started', limit: 50, offset: 0 },
      { collection: 'project_join_source_attempts', sort: 'window_started', limit: 50, offset: 0 }
    ]
  )
  assert.ok(dao.queries.every(({ filter }) => filter.startsWith('window_started <= "')))
})

test('a blocked source does not lock out a different source', () => {
  const now = 100 * day
  const dao = sourceAttemptDao()

  for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
    assert.equal(
      recordProjectJoinSourceFailure(dao, 'project-a', 'source-a', now),
      attemptNumber === 5
    )
  }
  assert.equal(
    projectJoinBlocked(projectJoinSourceAttempt(dao, 'project-a', 'source-a'), now),
    true
  )

  assert.equal(recordProjectJoinSourceFailure(dao, 'project-a', 'source-b', now), false)
  assert.equal(
    projectJoinBlocked(projectJoinSourceAttempt(dao, 'project-a', 'source-b'), now),
    false
  )
})
