import assert from 'node:assert/strict'
import test from 'node:test'

import { csvFatalMessage, parseCsvInspection } from '../src/lib/csvInspection.js'

test('parses backend CSV inspection metadata safely', () => {
  const result = parseCsvInspection(JSON.stringify({
    encoding: 'UTF-8',
    headers: ['entry_id', 'page', 'word'],
    pdf_page_field: 'page',
    total_rows: 3,
    valid_rows: 2,
    invalid_rows: 1,
    preview: [{ page: '1', word: '阿' }]
  }))

  assert.deepEqual(result, {
    encoding: 'UTF-8',
    headers: ['entry_id', 'page', 'word'],
    pdfPageField: 'page',
    totalRows: 3,
    validRows: 2,
    invalidRows: 1,
    preview: [{ page: '1', word: '阿' }]
  })
  assert.equal(parseCsvInspection('{bad json'), null)
})

test('formats a single fatal job error with its stable code', () => {
  assert.equal(csvFatalMessage({
    status: 'failed',
    error_code: 'CSV_HEADER_INVALID',
    error_message: '缺少页码字段'
  }), '[CSV_HEADER_INVALID] 缺少页码字段')
  assert.equal(csvFatalMessage({ status: 'validated' }), '')
})
