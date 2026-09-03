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
const password = 'QuorumTest123!'
const projectIds = []
const userIds = []
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
  userIds.push(user.id)
  const auth = await request('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: email, password }
  })
  return { id: user.id, token: auth.token }
}

async function createProject(name, requiredProofreads, users) {
  let project = await request('/api/fangji/projects', {
    method: 'POST',
    token: platformAuth.token,
    expected: 201,
    body: { name: `${name} ${suffix}` }
  })
  projectIds.push(project.id)
  if (requiredProofreads !== 2) {
    project = await request(`/api/fangji/projects/${project.id}`, {
      method: 'PATCH',
      token: platformAuth.token,
      body: { requiredProofreads }
    })
  }
  assert.equal(project.required_proofreads, requiredProofreads)
  for (const user of users) {
    await request(`/api/fangji/projects/${project.id}/members/${user.id}`, {
      method: 'PUT',
      token: platformAuth.token,
      body: { role: 'proofreader' }
    })
  }
  return project
}

async function setQuorum(projectId, requiredProofreads) {
  return request(`/api/fangji/projects/${projectId}`, {
    method: 'PATCH',
    token: platformAuth.token,
    body: { requiredProofreads }
  })
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

async function pageRecord(pageId) {
  return request(`/api/collections/pages/records/${pageId}`, { token: platformAuth.token })
}

async function claimAndSubmit(projectId, pageId, user, value, expectedStatus) {
  const claim = await request(`/api/fangji/projects/${projectId}/claim`, {
    method: 'POST',
    token: user.token
  })
  assert.equal(claim.id, pageId)
  assert.equal(claim.first_proofreader, undefined)
  assert.equal(claim.second_proofreader, undefined)
  assert.equal(claim.proofread_round, undefined)
  const result = await request(`/api/fangji/pages/${pageId}/submit`, {
    method: 'POST',
    token: user.token,
    body: {
      rowJson: JSON.stringify({ 词条: value }),
      text: value,
      leaseToken: claim.leaseToken
    }
  })
  assert.equal(result.status, expectedStatus)
  assert.equal(result.proofreadCount, undefined)
  assert.equal(result.requiredProofreads, undefined)
  return result
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
}

const users = await Promise.all([
  createUser('quorum-one'),
  createUser('quorum-two'),
  createUser('quorum-three'),
  createUser('quorum-four')
])

try {
  const matching = await createProject('Three matching', 3, users)
  const matchingPage = await createPage(matching.id, 1, '一致')
  await claimAndSubmit(matching.id, matchingPage.id, users[0], '一致', 'proofread')
  assert.equal((await pageRecord(matchingPage.id)).proofread_count, 1)
  const duplicateClaim = await request(`/api/fangji/projects/${matching.id}/claim`, {
    method: 'POST', token: users[0].token
  })
  assert.equal(duplicateClaim, null, 'one person can submit only once per page and round')
  await claimAndSubmit(matching.id, matchingPage.id, users[1], '一致', 'proofread')
  await claimAndSubmit(matching.id, matchingPage.id, users[2], '一致', 'approved')
  const matchingFinal = await pageRecord(matchingPage.id)
  assert.equal(matchingFinal.proofread_count, 3)
  assert.equal(matchingFinal.status, 'approved')

  const queues = await request('/api/fangji/proofreading-queues', { token: users[0].token })
  const serializedQueues = JSON.stringify(queues)
  for (const concealed of ['required_proofreads', 'proofread_count', 'first_proofreader', 'second_proofreader', 'pass_no']) {
    assert.equal(serializedQueues.includes(concealed), false, `queue leaked ${concealed}`)
  }

  const differing = await createProject('Three differing', 3, users)
  const differingPage = await createPage(differing.id, 1, '差异')
  await claimAndSubmit(differing.id, differingPage.id, users[0], '甲', 'proofread')
  await claimAndSubmit(differing.id, differingPage.id, users[1], '甲', 'proofread')
  await claimAndSubmit(differing.id, differingPage.id, users[2], '乙', 'arbitration')
  const arbitration = await request(`/api/fangji/pages/${differingPage.id}/arbitration`, {
    token: platformAuth.token
  })
  assert.equal(arbitration.attempts.length, 3)
  assert.deepEqual(arbitration.attempts.map((item) => item.kind), ['proofread', 'proofread', 'proofread'])
  await request(`/api/fangji/pages/${differingPage.id}/arbitrate`, {
    method: 'POST',
    token: platformAuth.token,
    body: { rowJson: JSON.stringify({ 词条: '甲' }), text: '甲', note: '三人仲裁' }
  })
  const allDifferingAttempts = await request(
    `/api/collections/proofreading_attempts/records?filter=${encodeURIComponent(`page="${differingPage.id}"`)}`,
    { token: platformAuth.token }
  )
  assert.deepEqual(allDifferingAttempts.items.map((item) => item.pass_no).sort((a, b) => a - b), [1, 2, 3, 4])
  await setQuorum(differing.id, 4)
  assert.equal((await pageRecord(differingPage.id)).status, 'approved', 'completed arbitration never reopens')

  const increasing = await createProject('Increase quorum', 2, users)
  const increasingPage = await createPage(increasing.id, 1, '增员')
  await claimAndSubmit(increasing.id, increasingPage.id, users[0], '增员', 'proofread')
  await claimAndSubmit(increasing.id, increasingPage.id, users[1], '增员', 'approved')
  await setQuorum(increasing.id, 3)
  const reopened = await pageRecord(increasingPage.id)
  assert.equal(reopened.status, 'proofread')
  assert.equal(reopened.proofread_count, 2)
  assert.equal(reopened.proofread_row_json, '')
  await claimAndSubmit(increasing.id, increasingPage.id, users[2], '增员', 'approved')

  const decreasing = await createProject('Decrease quorum', 4, users)
  const decreasingPage = await createPage(decreasing.id, 1, '减员')
  await claimAndSubmit(decreasing.id, decreasingPage.id, users[0], '减员', 'proofread')
  await claimAndSubmit(decreasing.id, decreasingPage.id, users[1], '减员', 'proofread')
  await setQuorum(decreasing.id, 2)
  const decreased = await pageRecord(decreasingPage.id)
  assert.equal(decreased.status, 'approved')
  assert.equal(decreased.proofread_count, 2)

  const leased = await createProject('Lease-aware quorum', 4, users)
  const leasedPage = await createPage(leased.id, 1, '租约')
  await claimAndSubmit(leased.id, leasedPage.id, users[0], '租约', 'proofread')
  await claimAndSubmit(leased.id, leasedPage.id, users[1], '租约', 'proofread')
  const activeClaim = await request(`/api/fangji/projects/${leased.id}/claim`, {
    method: 'POST', token: users[2].token
  })
  assert.equal(activeClaim.id, leasedPage.id)
  const activeBeforeChange = await pageRecord(leasedPage.id)
  assert.equal(activeBeforeChange.status, 'proofreading')
  assert.equal(activeBeforeChange.proofreader, users[2].id)
  const activeLeases = await request(
    `/api/collections/task_leases/records?filter=${encodeURIComponent(`page="${leasedPage.id}"`)}`,
    { token: superAuth.token }
  )
  assert.equal(activeLeases.totalItems, 1)
  assert.ok(new Date(activeLeases.items[0].expires_at).getTime() > Date.now())
  await setQuorum(leased.id, 2)
  const stillLeased = await pageRecord(leasedPage.id)
  assert.equal(stillLeased.status, 'proofreading')
  assert.equal(stillLeased.proofreader, users[2].id)
  await request(`/api/fangji/pages/${leasedPage.id}/submit`, {
    method: 'POST',
    token: users[2].token,
    body: { rowJson: JSON.stringify({ 词条: '租约' }), text: '租约', leaseToken: activeClaim.leaseToken }
  })
  assert.equal((await pageRecord(leasedPage.id)).status, 'approved')

  const expiredProject = await createProject('Expired lease quorum', 4, users)
  const expiredPage = await createPage(expiredProject.id, 1, '过期')
  await claimAndSubmit(expiredProject.id, expiredPage.id, users[0], '过期', 'proofread')
  await claimAndSubmit(expiredProject.id, expiredPage.id, users[1], '过期', 'proofread')
  const expiredClaim = await request(`/api/fangji/projects/${expiredProject.id}/claim`, {
    method: 'POST', token: users[2].token
  })
  await expireLease(expiredPage.id)
  await setQuorum(expiredProject.id, 2)
  const appliedAfterExpiry = await pageRecord(expiredPage.id)
  assert.equal(appliedAfterExpiry.status, 'approved')
  assert.equal(appliedAfterExpiry.proofreader, '')
  await request(`/api/fangji/pages/${expiredPage.id}/submit`, {
    method: 'POST',
    token: users[2].token,
    expected: 400,
    body: { rowJson: JSON.stringify({ 词条: '过期' }), text: '过期', leaseToken: expiredClaim.leaseToken }
  })

  console.log('Configurable proofreading quorum integration test passed.')
} finally {
  for (const projectId of projectIds.reverse()) {
    await request(`/api/fangji/projects/${projectId}`, {
      method: 'DELETE', token: platformAuth.token, expected: 204
    })
  }
  for (const userId of userIds.reverse()) {
    await request(`/api/collections/users/records/${userId}`, {
      method: 'DELETE', token: superAuth.token, expected: 204
    })
  }
}
