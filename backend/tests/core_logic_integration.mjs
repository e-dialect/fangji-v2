import assert from 'node:assert/strict'

const baseUrl = process.env.PB_URL || 'http://127.0.0.1:8090'
const adminEmail = process.env.APP_ADMIN_EMAIL || 'codex-test-admin@example.com'
const adminPassword = process.env.APP_ADMIN_PASSWORD || 'codex-test-admin-2026'

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
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = raw
    }
  }
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${raw}`)
  return payload
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = 'CoreLogicTest123!'
const userEmail = `core-logic-${suffix}@example.com`
const secondUserEmail = `core-logic-second-${suffix}@example.com`
let userId = ''
let secondUserId = ''
let projectId = ''

const adminAuth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: { identity: adminEmail, password: adminPassword }
})

try {
  const registered = await request('/api/collections/users/records', {
    method: 'POST',
    body: {
      email: userEmail,
      password,
      passwordConfirm: password,
      name: 'Core logic test',
      role: 'admin'
    }
  })
  userId = registered.id
  assert.equal(registered.role, 'proofreader')

  const userAuth = await request('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: userEmail, password }
  })
  await request(`/api/collections/users/records/${userId}`, {
    method: 'PATCH',
    token: userAuth.token,
    body: { role: 'admin' },
    expected: 403
  })
  const unchanged = await request(`/api/collections/users/records/${userId}`, {
    token: userAuth.token
  })
  assert.equal(unchanged.role, 'proofreader')

  const project = await request('/api/collections/projects/records', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      name: `Core logic ${suffix}`,
      description: 'temporary core logic integration project',
      admin: adminAuth.record.id
    }
  })
  projectId = project.id
  const page = await request('/api/collections/pages/records', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      project: projectId,
      page_number: 1,
      pdf_page: 1,
      ocr_row_json: JSON.stringify({ 词条: '天光', 释义: '早晨' }),
      ocr_text: '天光 早晨',
      proofread_round: 1,
      mismatch_count: 0,
      status: 'pending'
    }
  })
  await request(`/api/fangji/projects/${projectId}/claim`, {
    method: 'POST',
    token: userAuth.token
  })
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: userAuth.token,
    body: { rowJson: JSON.stringify({ 词条: '天光' }), text: 'ignored' },
    expected: 400
  })
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: userAuth.token,
    body: { rowJson: JSON.stringify({ 词条: '天光', 释义: { value: '早晨' } }), text: 'ignored' },
    expected: 400
  })
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: userAuth.token,
    body: { rowJson: JSON.stringify({ 词条: '', 释义: '  ' }), text: 'ignored' },
    expected: 400
  })
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: userAuth.token,
    body: {
      rowJson: JSON.stringify({ 词条: '天光', 释义: '清晨' }),
      text: '客户端伪造文本'
    }
  })
  const attempts = await request(
    `/api/collections/proofreading_attempts/records?filter=${encodeURIComponent(`page="${page.id}"`)}`,
    { token: userAuth.token }
  )
  assert.equal(attempts.totalItems, 1)
  assert.equal(attempts.items[0].text, '天光 清晨')

  const secondUser = await request('/api/collections/users/records', {
    method: 'POST',
    body: {
      email: secondUserEmail,
      password,
      passwordConfirm: password,
      name: 'Core logic second proofreader',
      role: 'proofreader'
    }
  })
  secondUserId = secondUser.id
  const secondUserAuth = await request('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: secondUserEmail, password }
  })
  const secondClaim = await request(`/api/fangji/projects/${projectId}/claim`, {
    method: 'POST',
    token: secondUserAuth.token
  })
  assert.equal(secondClaim.id, page.id)
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: secondUserAuth.token,
    body: { rowJson: JSON.stringify({ 词条: '天光' }), text: 'ignored' },
    expected: 400
  })
  await request(`/api/fangji/pages/${page.id}/submit`, {
    method: 'POST',
    token: secondUserAuth.token,
    body: {
      rowJson: JSON.stringify({ 释义: '清晨', 词条: '天光' }),
      text: '第二位客户端伪造文本'
    }
  })
  const approved = await request(`/api/collections/pages/records/${page.id}`, {
    token: adminAuth.token
  })
  assert.equal(approved.status, 'approved')
  assert.equal(approved.proofread_text, '天光 清晨')

  const pendingPages = []
  for (let pageNumber = 2; pageNumber <= 4; pageNumber += 1) {
    pendingPages.push(await request('/api/collections/pages/records', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        project: projectId,
        page_number: pageNumber,
        pdf_page: pageNumber,
        ocr_row_json: JSON.stringify({ 内容: `条目 ${pageNumber}` }),
        ocr_text: `条目 ${pageNumber}`,
        proofread_round: 1,
        mismatch_count: 0,
        status: 'pending'
      }
    }))
  }
  const reorderedIds = [pendingPages[2].id, pendingPages[0].id, pendingPages[1].id]
  await request(`/api/fangji/projects/${projectId}/pages/reorder`, {
    method: 'POST',
    token: userAuth.token,
    body: { orderedIds: reorderedIds },
    expected: 403
  })
  await request(`/api/fangji/projects/${projectId}/pages/reorder`, {
    method: 'POST',
    token: adminAuth.token,
    body: { orderedIds: reorderedIds }
  })
  const reordered = await request(
    `/api/collections/pages/records?filter=${encodeURIComponent(`project="${projectId}"`)}&sort=page_number&perPage=100`,
    { token: adminAuth.token }
  )
  assert.deepEqual(
    reordered.items.filter((item) => item.status === 'pending').map((item) => item.id),
    reorderedIds
  )

  await request('/api/collections/pages/records', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      project: projectId,
      page_number: 2,
      pdf_page: 9,
      ocr_row_json: JSON.stringify({ 内容: '重复条号' }),
      ocr_text: '重复条号',
      proofread_round: 1,
      mismatch_count: 0,
      status: 'pending'
    },
    expected: 400
  })

  await request(`/api/fangji/projects/${projectId}/pages/delete-pending`, {
    method: 'POST',
    token: adminAuth.token,
    body: { ids: [reorderedIds[1]] }
  })
  const resequenced = await request(
    `/api/collections/pages/records?filter=${encodeURIComponent(`project="${projectId}"`)}&sort=page_number&perPage=100`,
    { token: adminAuth.token }
  )
  assert.deepEqual(resequenced.items.map((item) => item.page_number), [1, 2, 3])
  assert.equal(resequenced.items.some((item) => item.id === reorderedIds[1]), false)

  console.log('Core logic integration test passed.')
} finally {
  if (projectId) {
    await request(`/api/collections/projects/records/${projectId}`, {
      method: 'DELETE',
      token: adminAuth.token,
      expected: 204
    })
  }
  if (userId) {
    await request(`/api/collections/users/records/${userId}`, {
      method: 'DELETE',
      token: adminAuth.token,
      expected: 204
    })
  }
  if (secondUserId) {
    await request(`/api/collections/users/records/${secondUserId}`, {
      method: 'DELETE',
      token: adminAuth.token,
      expected: 204
    })
  }
}
