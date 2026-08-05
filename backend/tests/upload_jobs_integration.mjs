import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const baseUrl = process.env.PB_URL || 'http://127.0.0.1:18091'
const email = process.env.APP_ADMIN_EMAIL || 'upload-test@example.com'
const password = process.env.APP_ADMIN_PASSWORD || 'UploadTest123!'

async function request(path, { method = 'GET', token = '', body, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {})
    },
    body
  })
  const raw = await response.text()
  let payload = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = raw
    }
  }
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${raw}`)
  return payload
}

async function waitFor(path, token, terminalStatuses, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const record = await request(path, { token })
    if (terminalStatuses.includes(record.status)) return record
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${path}`)
}

function minimalPdf(pageCount = 1) {
  const objects = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  const pageIds = Array.from({ length: pageCount }, (_, index) => 3 + index)
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = 3 + index
    const contentId = 3 + pageCount + index
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents ${contentId} 0 R >>`
    objects[contentId] = '<< /Length 0 >>\nstream\n\nendstream'
  }

  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output)
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length}\n`
  output += '0000000000 65535 f \n'
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return output
}

const authBody = new FormData()
authBody.set('identity', email)
authBody.set('password', password)
const auth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: authBody
})
const token = auth.token

const projectBody = JSON.stringify({
  name: `Upload integration ${Date.now()}`,
  description: 'temporary upload integration project',
  admin: auth.record.id
})
const project = await request('/api/collections/projects/records', {
  method: 'POST',
  token,
  body: projectBody,
  expected: 200
})

try {
  const csv = [
    'PDF页码,词条,释义',
    '1,天光,早晨',
    'abc,坏页码,应跳过',
    '2,"跨行词条","第一行',
    '第二行"',
    '3,,'
  ].join('\r\n')
  const csvBody = new FormData()
  csvBody.set('file', new Blob([csv], { type: 'text/csv' }), 'sample.csv')
  const queuedJob = await request(`/api/fangji/projects/${project.id}/imports/csv`, {
    method: 'POST',
    token,
    body: csvBody,
    expected: 202
  })
  const job = await waitFor(
    `/api/collections/import_jobs/records/${queuedJob.id}`,
    token,
    ['completed', 'completed_with_errors', 'failed']
  )
  assert.equal(job.status, 'completed_with_errors')
  assert.equal(job.success_count, 2)
  assert.equal(job.failed_count, 2)
  assert.equal(job.total_count, 4)

  const errors = await request(
    `/api/collections/import_job_errors/records?filter=${encodeURIComponent(`job="${job.id}"`)}&sort=row_number`,
    { token }
  )
  assert.deepEqual(
    errors.items.map((item) => item.error_code),
    ['INVALID_PDF_PAGE', 'EMPTY_CONTENT']
  )

  const pages = await request(
    `/api/collections/pages/records?filter=${encodeURIComponent(`project="${project.id}"`)}&sort=page_number`,
    { token }
  )
  assert.equal(pages.totalItems, 2)
  assert.ok(pages.items.every((item) => item.import_job === job.id))
  assert.match(pages.items[1].ocr_text, /第一行\s+第二行/)

  const largeRows = ['\ufeffentry_id,page,词条,释义']
  for (let index = 1; index <= 1200; index += 1) {
    largeRows.push(`${index},${Math.ceil(index / 10)},词条${index},释义${index}`)
  }
  largeRows.push('1201,not-a-page,错误词条,错误释义')
  const inspectionBody = new FormData()
  inspectionBody.set(
    'file',
    new Blob([largeRows.join('\r\n')], { type: 'text/csv' }),
    'large-alias.csv'
  )
  inspectionBody.set('inspect_only', 'true')
  const inspectingJob = await request(`/api/fangji/projects/${project.id}/imports/csv`, {
    method: 'POST',
    token,
    body: inspectionBody,
    expected: 202
  })
  const inspectedJob = await waitFor(
    `/api/collections/import_jobs/records/${inspectingJob.id}`,
    token,
    ['validated', 'failed']
  )
  assert.equal(inspectedJob.status, 'validated')
  assert.equal(inspectedJob.total_count, 1201)
  assert.equal(inspectedJob.success_count, 1200)
  assert.equal(inspectedJob.failed_count, 1)
  const inspection = JSON.parse(inspectedJob.inspection_json)
  assert.equal(inspection.encoding, 'UTF-8')
  assert.equal(inspection.pdf_page_field, 'page')
  assert.deepEqual(inspection.headers, ['entry_id', 'page', '词条', '释义'])
  assert.equal(inspection.preview.length, 5)

  const preflightErrors = await request(
    `/api/collections/import_job_errors/records?filter=${encodeURIComponent(`job="${inspectedJob.id}"`)}`,
    { token }
  )
  assert.deepEqual(preflightErrors.items.map((item) => item.error_code), ['INVALID_PDF_PAGE'])

  const queuedInspectedJob = await request(`/api/fangji/imports/${inspectedJob.id}/commit`, {
    method: 'POST',
    token,
    expected: 202
  })
  assert.equal(queuedInspectedJob.status, 'queued')
  const importedInspectedJob = await waitFor(
    `/api/collections/import_jobs/records/${inspectedJob.id}`,
    token,
    ['completed', 'completed_with_errors', 'failed']
  )
  assert.equal(importedInspectedJob.status, 'completed_with_errors')
  assert.equal(importedInspectedJob.success_count, 1200)
  assert.equal(importedInspectedJob.failed_count, 1)
  const importedAliasPages = await request(
    `/api/collections/pages/records?filter=${encodeURIComponent(`import_job="${inspectedJob.id}"`)}&perPage=1`,
    { token }
  )
  assert.equal(importedAliasPages.totalItems, 1200)

  const duplicateBody = new FormData()
  duplicateBody.set(
    'file',
    new Blob([largeRows.join('\r\n')], { type: 'text/csv' }),
    'large-alias.csv'
  )
  duplicateBody.set('inspect_only', 'true')
  const duplicateJob = await request(`/api/fangji/projects/${project.id}/imports/csv`, {
    method: 'POST',
    token,
    body: duplicateBody,
    expected: 200
  })
  assert.equal(duplicateJob.id, inspectedJob.id)
  assert.equal(duplicateJob.status, 'completed_with_errors')

  const validPdfBody = new FormData()
  validPdfBody.set('file', new Blob([minimalPdf(1)], { type: 'application/pdf' }), 'valid.pdf')
  const validPdfRecord = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
    method: 'POST',
    token,
    body: validPdfBody,
    expected: 202
  })
  const validPdf = await waitFor(
    `/api/collections/project_files/records/${validPdfRecord.id}`,
    token,
    ['ready', 'error']
  )
  assert.equal(validPdf.status, 'ready')
  assert.equal(validPdf.page_count, 1)
  assert.equal(validPdf.validation_tool, 'pdfcpu v0.8.1')
  assert.equal(validPdf.is_primary, true)

  const replacementPdfBody = new FormData()
  replacementPdfBody.set('file', new Blob([minimalPdf(2)], { type: 'application/pdf' }), 'replacement.pdf')
  const replacementPdfRecord = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
    method: 'POST',
    token,
    body: replacementPdfBody,
    expected: 202
  })
  const replacementPdf = await waitFor(
    `/api/collections/project_files/records/${replacementPdfRecord.id}`,
    token,
    ['ready', 'error']
  )
  assert.equal(replacementPdf.status, 'ready')
  assert.equal(replacementPdf.page_count, 2)
  assert.equal(replacementPdf.is_primary, true)
  const supersededPdf = await request(
    `/api/collections/project_files/records/${validPdf.id}`,
    { token }
  )
  assert.equal(supersededPdf.is_primary, false)
  assert.ok(supersededPdf.superseded_at)

  const outOfRangeCsvBody = new FormData()
  outOfRangeCsvBody.set(
    'file',
    new Blob(['page,词条\r\n3,超范围'], { type: 'text/csv' }),
    'out-of-range.csv'
  )
  outOfRangeCsvBody.set('inspect_only', 'true')
  const outOfRangeJobRecord = await request(`/api/fangji/projects/${project.id}/imports/csv`, {
    method: 'POST',
    token,
    body: outOfRangeCsvBody,
    expected: 202
  })
  const outOfRangeJob = await waitFor(
    `/api/collections/import_jobs/records/${outOfRangeJobRecord.id}`,
    token,
    ['validated', 'failed']
  )
  assert.equal(outOfRangeJob.status, 'validated')
  assert.equal(outOfRangeJob.success_count, 0)
  assert.equal(outOfRangeJob.failed_count, 1)
  const outOfRangeErrors = await request(
    `/api/collections/import_job_errors/records?filter=${encodeURIComponent(`job="${outOfRangeJob.id}"`)}`,
    { token }
  )
  assert.deepEqual(outOfRangeErrors.items.map((item) => item.error_code), ['PDF_PAGE_OUT_OF_RANGE'])

  const invalidPdfBody = new FormData()
  invalidPdfBody.set('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'invalid.pdf')
  const invalidPdf = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
    method: 'POST',
    token,
    body: invalidPdfBody,
    expected: 400
  })
  assert.match(invalidPdf.message, /不是有效的 PDF/)

  const corruptPdfBody = new FormData()
  corruptPdfBody.set(
    'file',
    new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'], { type: 'application/pdf' }),
    'corrupt.pdf'
  )
  const corruptPdfRecord = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
    method: 'POST',
    token,
    body: corruptPdfBody,
    expected: 202
  })
  const corruptPdf = await waitFor(
    `/api/collections/project_files/records/${corruptPdfRecord.id}`,
    token,
    ['ready', 'error']
  )
  assert.equal(corruptPdf.status, 'error')
  assert.equal(corruptPdf.error_code, 'PDF_DEEP_VALIDATION_FAILED')

  const realPdfPath = process.env.REAL_PDF_PATH
  const realCsvPath = process.env.REAL_CSV_PATH
  if (realPdfPath && realCsvPath) {
    const realPdfBody = new FormData()
    realPdfBody.set(
      'file',
      new Blob([await readFile(realPdfPath)], { type: 'application/pdf' }),
      basename(realPdfPath)
    )
    const realPdfRecord = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
      method: 'POST',
      token,
      body: realPdfBody,
      expected: 202
    })
    const realPdf = await waitFor(
      `/api/collections/project_files/records/${realPdfRecord.id}`,
      token,
      ['ready', 'error'],
      300_000
    )
    assert.equal(
      realPdf.status,
      'ready',
      `${realPdf.error_code || 'PDF_ERROR'}: ${realPdf.error_message || 'unknown PDF validation error'}`
    )
    assert.ok(realPdf.page_count > 0)
    assert.equal(realPdf.is_primary, true)

    const realCsvBody = new FormData()
    realCsvBody.set(
      'file',
      new Blob([await readFile(realCsvPath)], { type: 'text/csv' }),
      basename(realCsvPath)
    )
    realCsvBody.set('inspect_only', 'true')
    const realCsvRecord = await request(`/api/fangji/projects/${project.id}/imports/csv`, {
      method: 'POST',
      token,
      body: realCsvBody,
      expected: 202
    })
    const realCsv = await waitFor(
      `/api/collections/import_jobs/records/${realCsvRecord.id}`,
      token,
      ['validated', 'failed'],
      300_000
    )
    assert.equal(realCsv.status, 'validated')
    assert.ok(realCsv.total_count > 0)
    assert.equal(realCsv.failed_count, 0)
  }

  console.log('Upload job integration test passed.')
} finally {
  await request(`/api/collections/projects/records/${project.id}`, {
    method: 'DELETE',
    token,
    expected: 204
  })
}
