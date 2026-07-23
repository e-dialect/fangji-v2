import test from 'node:test'
import assert from 'node:assert/strict'
import { filterAdminPages, paginateItems, parseRangeInput } from '../src/lib/adminPageList.js'

const pages = [
  {
    id: 'one',
    page_number: 1,
    pdf_page: 8,
    status: 'pending',
    ocr_text: '天光',
    expand: { first_proofreader: { name: '林一' } }
  },
  {
    id: 'two',
    page_number: 2,
    pdf_page: 9,
    status: 'arbitration',
    ocr_text: '食饭',
    expand: { second_proofreader: { email: 'proofreader@example.com' } }
  },
  {
    id: 'three',
    page_number: 3,
    pdf_page: 10,
    status: 'approved',
    proofread_text: '厝边'
  }
]

test('filters admin rows by status and human-visible search fields', () => {
  assert.deepEqual(filterAdminPages(pages, { query: '天光' }).map((page) => page.id), ['one'])
  assert.deepEqual(filterAdminPages(pages, { query: 'PROOFREADER@' }).map((page) => page.id), ['two'])
  assert.deepEqual(filterAdminPages(pages, { query: '10', status: 'approved' }).map((page) => page.id), ['three'])
  assert.deepEqual(filterAdminPages(pages, { status: 'pending' }).map((page) => page.id), ['one'])
})

test('paginates rows and clamps invalid page numbers', () => {
  const items = Array.from({ length: 26 }, (_, index) => index + 1)
  assert.deepEqual(paginateItems(items, 2, 10), {
    items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    page: 2,
    perPage: 10,
    totalItems: 26,
    totalPages: 3
  })
  assert.equal(paginateItems(items, 99, 10).page, 3)
  assert.equal(paginateItems([], 4, 10).page, 1)
})

test('parses normal, reversed and Chinese-comma ranges safely', () => {
  assert.deepEqual(parseRangeInput('1-3, 5，8-7', 8), [0, 1, 2, 4, 6, 7])
  assert.deepEqual(parseRangeInput('0, nope, 12', 8), [])
  assert.deepEqual(parseRangeInput('', 8), [])
})
