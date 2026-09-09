import test from 'node:test'
import assert from 'node:assert/strict'
import { getPbMessage, getUploadErrorMessage } from '../src/utils/pbErrors.js'

test('upload 413 errors show the PDF and CSV limits instead of proxy error messages', () => {
  for (const error of [
    { status: 413, message: 'Request Entity Too Large' },
    { response: { status: 413, message: 'Request Entity Too Large' } }
  ]) {
    assert.equal(getUploadErrorMessage(error, 'pdf'), 'PDF 文件超过 100 MiB 上限')
    assert.equal(getUploadErrorMessage(error, 'csv'), 'CSV 文件超过 50 MiB 上限')
  }
})

test('other upload errors preserve server validation messages and existing fallbacks', () => {
  const error = { status: 400, response: { message: '文件内容不是有效的 PDF。' } }
  assert.equal(getUploadErrorMessage(error, 'pdf'), '文件内容不是有效的 PDF。')
  assert.equal(getUploadErrorMessage({}, 'pdf'), '上传失败，请重试')
  assert.equal(getUploadErrorMessage({}, 'csv'), '导入失败，请检查文件格式')
})

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
