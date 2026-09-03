import assert from 'node:assert/strict'

const baseUrl = process.env.PB_URL || 'http://127.0.0.1:18091'
const platformEmail = process.env.APP_ADMIN_EMAIL
const platformPassword = process.env.APP_ADMIN_PASSWORD
if (!platformEmail || !platformPassword) {
  throw new Error('Set APP_ADMIN_EMAIL and APP_ADMIN_PASSWORD before running this integration test.')
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
const password = 'KeyboardTest123!'
const userEmail = `keyboard-${suffix}@example.com`
const platformAuth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: { identity: platformEmail, password: platformPassword }
})
const platform = { id: platformAuth.record.id, token: platformAuth.token }
const user = await request('/api/collections/users/records', {
  method: 'POST',
  body: {
    email: userEmail,
    password,
    passwordConfirm: password,
    name: 'Keyboard proofreader',
    role: 'user'
  }
})
const userAuth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: { identity: userEmail, password }
})

let projectId = ''
try {
  const library = await request('/api/fangji/keyboards', { token: platform.token })
  assert.equal(library.length, 1)
  assert.equal(library[0].keyboardId, 'hinghwa-dialect')
  assert.equal(library[0].name, '莆仙方言键盘')
  assert.equal(library[0].definition.schemaVersion, 1)
  assert.equal(library[0].definition.sections.length, 7)

  const project = await request('/api/fangji/projects', {
    method: 'POST',
    token: platform.token,
    expected: 201,
    body: { name: `Keyboard project ${suffix}` }
  })
  projectId = project.id
  const initialConfig = await request(`/api/fangji/projects/${projectId}/keyboards`, { token: platform.token })
  assert.deepEqual(initialConfig.items.map((item) => item.keyboardId), ['hinghwa-dialect'])
  assert.equal(initialConfig.defaultKeyboardId, 'hinghwa-dialect')

  await request(`/api/fangji/projects/${projectId}/keyboards`, { token: userAuth.token, expected: 403 })
  await request('/api/collections/keyboards/records', { token: userAuth.token, expected: 403 })

  await request(`/api/fangji/projects/${projectId}/members/${user.id}`, {
    method: 'PUT',
    token: platform.token,
    body: { role: 'proofreader' }
  })
  const memberConfig = await request(`/api/fangji/projects/${projectId}/keyboards`, { token: userAuth.token })
  assert.equal(memberConfig.items[0].keyboardId, 'hinghwa-dialect')

  await request(`/api/fangji/projects/${projectId}/keyboards`, {
    method: 'PUT',
    token: userAuth.token,
    expected: 403,
    body: { keyboardIds: [], defaultKeyboardId: '' }
  })
  const disabled = await request(`/api/fangji/projects/${projectId}/keyboards`, {
    method: 'PUT',
    token: platform.token,
    body: { keyboardIds: [], defaultKeyboardId: '' }
  })
  assert.deepEqual(disabled, { items: [], defaultKeyboardId: null })
  const hiddenForMember = await request(`/api/fangji/projects/${projectId}/keyboards`, { token: userAuth.token })
  assert.equal(hiddenForMember.items.length, 0)

  await request(`/api/fangji/projects/${projectId}/keyboards`, {
    method: 'PUT',
    token: platform.token,
    expected: 400,
    body: { keyboardIds: ['hinghwa-dialect'], defaultKeyboardId: 'missing-keyboard' }
  })
  await request(`/api/fangji/projects/${projectId}/keyboards`, {
    method: 'PUT',
    token: platform.token,
    body: { keyboardIds: ['hinghwa-dialect'], defaultKeyboardId: 'hinghwa-dialect' }
  })

  console.log('Keyboard integration test passed.')
} finally {
  if (projectId) {
    await request(`/api/fangji/projects/${projectId}`, {
      method: 'DELETE',
      token: platform.token,
      expected: 204
    })
  }
}
