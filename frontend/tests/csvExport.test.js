import test from 'node:test'
import assert from 'node:assert/strict'

import { toSafeCsvCell } from '../src/lib/csvExport.js'

test('escapes CSV delimiters, quotes and newlines', () => {
  assert.equal(toSafeCsvCell('普通文本'), '普通文本')
  assert.equal(toSafeCsvCell('甲,乙'), '"甲,乙"')
  assert.equal(toSafeCsvCell('甲"乙'), '"甲""乙"')
  assert.equal(toSafeCsvCell('甲\n乙'), '"甲\n乙"')
})

test('neutralizes spreadsheet formula prefixes', () => {
  assert.equal(toSafeCsvCell('=1+1'), "'=1+1")
  assert.equal(toSafeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)")
  assert.equal(toSafeCsvCell('-2+3'), "'-2+3")
  assert.equal(toSafeCsvCell('@cmd'), "'@cmd")
  assert.equal(toSafeCsvCell('  =HYPERLINK("https://example.com")'), '"\'  =HYPERLINK(""https://example.com"")"')
})
