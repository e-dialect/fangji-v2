import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseProjectKeyboard, keyboardPreferenceKey } from '../src/lib/keyboardSelection.js'

const keyboards = [
  { keyboardId: 'one', name: 'One' },
  { keyboardId: 'two', name: 'Two' }
]

test('prefers the remembered keyboard when it is still enabled', () => {
  assert.equal(chooseProjectKeyboard(keyboards, 'one', 'two').keyboardId, 'two')
})

test('falls back to the project default and then the first enabled keyboard', () => {
  assert.equal(chooseProjectKeyboard(keyboards, 'two', 'removed').keyboardId, 'two')
  assert.equal(chooseProjectKeyboard(keyboards, 'removed', 'removed').keyboardId, 'one')
  assert.equal(chooseProjectKeyboard([], 'one', 'one'), null)
})

test('scopes remembered keyboard choices by user and project', () => {
  assert.notEqual(keyboardPreferenceKey('user-a', 'project-a'), keyboardPreferenceKey('user-b', 'project-a'))
  assert.notEqual(keyboardPreferenceKey('user-a', 'project-a'), keyboardPreferenceKey('user-a', 'project-b'))
})
