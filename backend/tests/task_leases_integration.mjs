import assert from 'node:assert/strict'

const baseUrl = process.env.PB_URL || 'http://127.0.0.1:18091'
const platformEmail = process.env.APP_ADMIN_EMAIL
const platformPassword = process.env.APP_ADMIN_PASSWORD
const superEmail = process.env.PB_SUPER_EMAIL
const superPassword = process.env.PB_SUPER_PASSWORD
if (!platformEmail || !platformPassword || !superEmail || !superPassword) {
  throw new Error('Set APP_ADMIN_EMAIL, APP_ADMIN_PASSWORD, PB_SUPER_EMAIL and PB_SUPER_PASSWORD.')
}

async function request(path, { method = 'GET', token = '', body, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const raw = await response.text()
  let payload = null
  if (raw) {
    try { payload = JSON.parse(raw) } catch { payload = raw }
  }
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${raw}`)
  return payload
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'TaskLeaseTest123!'
const platformAuth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: { identity: platformEmail, password: platformPassword }
})
const superAuth = await request('/api/admins/auth-with-password', {
  method: 'POST',
  body: { identity: superEmail, password: superPassword }
})

async function createUser(label) {
  const email = `${label}-${suffix}@example.com`
  const user = await request('/api/collections/users/records', {
    method: 'POST',
    token: superAuth.token,
    body: { email, password, passwordConfirm: password, name: label, role: 'user' }
  })
  const auth = await request('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: email, password }
  })
  return { id: user.id, token: auth.token }
}

async function createPage(projectId, pageNumber, value) {
  return request('/api/collections/pages/records', {
    method: 'POST',
    token: superAuth.token,
    body: {
      project: projectId,
      page_number: pageNumber,
      pdf_page: pageNumber,
      ocr_row_json: JSON.stringify({ 词条: value }),
      ocr_text: value,
      proofread_round: 1,
      mismatch_count: 0,
      status: 'pending'
    }
  })
}

async function expireLease(pageId) {
  const leases = await request(
    `/api/collections/task_leases/records?filter=${encodeURIComponent(`page="${pageId}"`)}`,
    { token: superAuth.token }
  )
  assert.equal(leases.totalItems, 1)
  await request(`/api/collections/task_leases/records/${leases.items[0].id}`, {
    method: 'PATCH',
    token: superAuth.token,
    body: { expires_at: '2020-01-01 00:00:00.000Z' }
  })
  await request(`/api/collections/pages/records/${pageId}`, {
    method: 'PATCH',
    token: superAuth.token,
    body: { lease_expires_at: '2020-01-01 00:00:00.000Z' }
  })
  return leases.items[0]
}

const first = await createUser('lease-first')
const second = await createUser('lease-second')
let projectId = ''

try {
  const project = await request('/api/fangji/projects', {
    method: 'POST',
    token: platformAuth.token,
    expected: 201,
    body: { name: `Task leases ${suffix}` }
  })
  projectId = project.id
  for (const user of [first, second]) {
    await request(`/api/fangji/projects/${projectId}/members/${user.id}`, {
      method: 'PUT',
      token: platformAuth.token,
      body: { role: 'proofreader' }
    })
  }

  const renewedPage = await createPage(projectId, 1, '续租')
  const firstClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: first.token })
  assert.equal(firstClaim.id, renewedPage.id)
  assert.equal(firstClaim.leaseToken.length, 64)
  const persisted = await request(
    `/api/collections/task_leases/records?filter=${encodeURIComponent(`page="${renewedPage.id}"`)}`,
    { token: superAuth.token }
  )
  assert.equal(persisted.items[0].token_hash.length, 64)
  assert.notEqual(persisted.items[0].token_hash, firstClaim.leaseToken)
  await request('/api/collections/task_leases/records', { token: first.token, expected: 403 })
  const renewed = await request(`/api/fangji/pages/${renewedPage.id}/lease/renew`, {
    method: 'POST', token: first.token, body: { leaseToken: firstClaim.leaseToken }
  })
  assert.ok(new Date(renewed.leaseExpiresAt).getTime() >= new Date(firstClaim.leaseExpiresAt).getTime())
  await request(`/api/fangji/pages/${renewedPage.id}/submit`, {
    method: 'POST', token: first.token, expected: 400,
    body: { rowJson: JSON.stringify({ 词条: '续租' }), text: '续租', leaseToken: 'invalid' }
  })
  await request(`/api/fangji/pages/${renewedPage.id}/submit`, {
    method: 'POST', token: first.token,
    body: { rowJson: JSON.stringify({ 词条: '续租' }), text: '续租', leaseToken: firstClaim.leaseToken }
  })
  const renewedSecondClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: second.token })
  await request(`/api/fangji/pages/${renewedPage.id}/submit`, {
    method: 'POST', token: second.token,
    body: { rowJson: JSON.stringify({ 词条: '续租' }), text: '续租', leaseToken: renewedSecondClaim.leaseToken }
  })

  const expiredSubmitPage = await createPage(projectId, 2, '过期提交')
  const expiredClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: first.token })
  assert.equal(expiredClaim.id, expiredSubmitPage.id)
  await expireLease(expiredSubmitPage.id)
  const expiredSubmit = await request(`/api/fangji/pages/${expiredSubmitPage.id}/submit`, {
    method: 'POST', token: first.token,
    body: { rowJson: JSON.stringify({ 词条: '过期提交' }), text: '过期提交', leaseToken: expiredClaim.leaseToken }
  })
  assert.equal(expiredSubmit.status, 'proofread', 'an expired lease remains valid until another claim replaces it')
  const expiredSecondClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: second.token })
  await request(`/api/fangji/pages/${expiredSubmitPage.id}/submit`, {
    method: 'POST', token: second.token,
    body: { rowJson: JSON.stringify({ 词条: '过期提交' }), text: '过期提交', leaseToken: expiredSecondClaim.leaseToken }
  })

  const reclaimedPage = await createPage(projectId, 3, '重新领取')
  const staleClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: first.token })
  assert.equal(staleClaim.id, reclaimedPage.id)
  await expireLease(reclaimedPage.id)
  const replacementClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: second.token })
  assert.equal(replacementClaim.id, reclaimedPage.id)
  assert.notEqual(replacementClaim.leaseToken, staleClaim.leaseToken)
  await request(`/api/fangji/pages/${reclaimedPage.id}/submit`, {
    method: 'POST', token: first.token, expected: 400,
    body: { rowJson: JSON.stringify({ 词条: '旧标签页' }), text: '旧标签页', leaseToken: staleClaim.leaseToken }
  })
  await request(`/api/fangji/pages/${reclaimedPage.id}/submit`, {
    method: 'POST', token: second.token,
    body: { rowJson: JSON.stringify({ 词条: '重新领取' }), text: '重新领取', leaseToken: replacementClaim.leaseToken }
  })

  const releasableClaim = await request(`/api/fangji/projects/${projectId}/claim`, { method: 'POST', token: first.token })
  assert.equal(releasableClaim.id, reclaimedPage.id)
  await request(`/api/fangji/pages/${reclaimedPage.id}/release`, {
    method: 'POST', token: first.token, expected: 204,
    body: { leaseToken: releasableClaim.leaseToken }
  })
  const releasedPage = await request(`/api/collections/pages/records/${reclaimedPage.id}`, { token: platformAuth.token })
  assert.equal(releasedPage.status, 'proofread')
  assert.equal(releasedPage.proofreader, '')
  assert.equal(releasedPage.lease_expires_at, '')

  console.log('Task lease integration test passed.')
} finally {
  if (projectId) {
    await request(`/api/fangji/projects/${projectId}`, {
      method: 'DELETE', token: platformAuth.token, expected: 204
    })
  }
}
