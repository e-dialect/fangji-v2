import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { useStructuredRow, insertTextAtSelection } from '../src/composables/useStructuredRow.js'
import { toSafeCsvCell } from '../src/lib/csvExport.js'

const keyboard = JSON.parse(await readFile(new URL('../../backend/keyboards/hinghwa-dialect.json', import.meta.url)))

test('each new key inserts its exact value and survives draft JSON / UTF-8 CSV', () => {
  const row = useStructuredRow()
  for (const section of keyboard.sections) for (const key of section.keys) {
    row.hydrateForProofread({ ocr_row_json: '{"读音":"甲a乙"}' })
    const cursor = row.insertText(key.value, { start: 2, end: 2 })
    const expected = '甲a' + key.value + '乙'
    assert.equal(cursor, 2 + key.value.length)
    assert.equal(JSON.parse(row.stringifyEditedRow()).读音, expected)
    assert.equal(Buffer.from(toSafeCsvCell(expected), 'utf8').toString('utf8'), expected)
  }
})

test('similar symbols and combining sequences are not normalized', () => {
  const text = '〔ǾØ∣|‖ɔɑɡ①﹑－―—～５〕'
  assert.equal(insertTextAtSelection('甲乙', text, 1, 2).value, '甲' + text)
  for (const key of keyboard.sections.find(s => s.id === 'combining-marks').keys) {
    assert.equal(key.label, '◌' + key.value)
    assert.equal(Array.from(key.value).length, 1)
    assert.equal(insertTextAtSelection('a', key.value, 1).value, 'a' + key.value)
  }
})
