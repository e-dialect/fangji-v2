import assert from 'node:assert/strict'

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

async function waitFor(path, token, terminalStatuses) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const record = await request(path, { token })
    if (terminalStatuses.includes(record.status)) return record
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${path}`)
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

  const validPdfBody = new FormData()
  validPdfBody.set('file', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'valid.pdf')
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

  const invalidPdfBody = new FormData()
  invalidPdfBody.set('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'invalid.pdf')
  const invalidPdf = await request(`/api/fangji/projects/${project.id}/files/pdf`, {
    method: 'POST',
    token,
    body: invalidPdfBody,
    expected: 400
  })
  assert.match(invalidPdf.message, /不是有效的 PDF/)

  console.log('Upload job integration test passed.')
} finally {
  await request(`/api/collections/projects/records/${project.id}`, {
    method: 'DELETE',
    token,
    expected: 204
  })
}
