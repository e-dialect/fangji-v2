import test from 'node:test'
import assert from 'node:assert/strict'
import { fieldAt, navigateField } from '../src/lib/fieldNavigation.js'

test('field navigation visits fields before entering the overview', () => {
  assert.deepEqual(navigateField(3, 0, 'next'), { index: 1, overview: false })
  assert.deepEqual(navigateField(3, 1, 'next'), { index: 2, overview: false })
  assert.deepEqual(navigateField(3, 2, 'next'), { index: 2, overview: true })
  assert.deepEqual(navigateField(3, 2, 0), { index: 0, overview: false })
})
test('single and empty field lists can reach overview without invalid indices', () => {
  assert.deepEqual(navigateField(1, 0, 'next'), { index: 0, overview: true })
  assert.deepEqual(navigateField(0, 0, 'next'), { index: 0, overview: true })
  assert.equal(fieldAt([], 0), '')
})
test('changing the field filter clamps navigation to remaining fields', () => {
  assert.equal(fieldAt(['读音'], 3), '读音')
  assert.deepEqual(navigateField(1, 3, 3), { index: 0, overview: false })
  assert.deepEqual(navigateField(3, 0, -1), { index: 0, overview: false })
})
