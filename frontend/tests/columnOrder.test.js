import test from 'node:test'
import assert from 'node:assert/strict'
import { orderedRowHeaders, useStructuredRow } from '../src/composables/useStructuredRow.js'
test('CSV order survives JSON numeric-key enumeration in proofreading and review', () => {
 const page={ocr_row_json:JSON.stringify({'2':'二','10':'十','释义':'意思','词条':'𢶀'}),row_headers_json:JSON.stringify(['词条','10','释义','2'])}
 const row=useStructuredRow()
 row.hydrateForProofread(page)
 assert.deepEqual(row.rowHeaders.value,['词条','10','释义','2'])
 assert.equal(row.composeCurrentText(),'𢶀 十 意思 二')
 row.hydrateForReview(page)
 assert.deepEqual(row.rowHeaders.value,['词条','10','释义','2'])
 assert.deepEqual(orderedRowHeaders({row_headers_json:'invalid'},{甲:'',乙:''}),['甲','乙'])
})
