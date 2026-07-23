import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearTaskDraft,
  loadTaskDraft,
  saveTaskDraft,
  setTaskFlash,
  takeTaskFlash,
  taskDraftKey
} from '../src/lib/taskDraft.js'
import { insertTextAtSelection } from '../src/composables/useStructuredRow.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  }
}

test('inserts special characters at the caret and replaces selections', () => {
  assert.deepEqual(insertTextAtSelection('abcd', 'ŋ', 2, 2), {
    value: 'abŋcd',
    cursor: 3
  })
  assert.deepEqual(insertTextAtSelection('abcd', 'ŋ', 1, 3), {
    value: 'aŋd',
    cursor: 2
  })
})

test('persists, validates and clears a compatible task draft', () => {
  const storage = memoryStorage()
  const input = {
    userId: 'user-1',
    pageId: 'page-1',
    sourceSignature: '{"词条":"天光"}',
    row: { 词条: '天光', 释义: '清晨' },
    savedAt: '2026-07-23T08:00:00.000Z'
  }
  saveTaskDraft(storage, input)
  assert.deepEqual(loadTaskDraft(storage, input), {
    version: 1,
    ...input
  })
  assert.equal(loadTaskDraft(storage, { ...input, sourceSignature: 'changed' }), null)
  assert.equal(storage.getItem(taskDraftKey('user-1', 'page-1')), null)

  saveTaskDraft(storage, input)
  clearTaskDraft(storage, input)
  assert.equal(loadTaskDraft(storage, input), null)
})

test('moves task feedback through session storage exactly once', () => {
  const storage = memoryStorage()
  setTaskFlash(storage, '上一条已提交')
  assert.equal(takeTaskFlash(storage), '上一条已提交')
  assert.equal(takeTaskFlash(storage), '')
})
