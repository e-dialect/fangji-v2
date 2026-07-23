import test from 'node:test'
import assert from 'node:assert/strict'
import { getPbMessage } from '../src/utils/pbErrors.js'

test('uses PocketBase field validation details when available', () => {
  assert.equal(getPbMessage({
    response: {
      message: 'Failed to create record.',
      data: {
        admin: { message: '关联的管理员账号不存在' },
        name: { message: '项目名称不能为空' }
      }
    }
  }, '创建失败'), '关联的管理员账号不存在；项目名称不能为空')
})

test('replaces generic PocketBase messages with the localized fallback', () => {
  assert.equal(getPbMessage({
    message: 'Failed to create record.',
    response: { message: 'Failed to create record.', data: {} }
  }, '创建失败，请重新登录后重试'), '创建失败，请重新登录后重试')
})

test('preserves useful server messages', () => {
  assert.equal(getPbMessage({
    response: { message: '该条目已被其他校对员处理', data: {} }
  }, '提交失败'), '该条目已被其他校对员处理')
})
