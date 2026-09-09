import assert from 'node:assert/strict'

// Run against the production Nginx entrypoint, not Vite.
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:18080'
for (const [directory, manifestName, missingFile] of [
  ['rare-han', 'manifest.json', 'rare-1234-000000000000.woff2'],
  ['phonetic', 'manifest.json', 'phonetic-000000000000.woff2'],
  ['phonetic', 'symbols-manifest.json', 'symbols-000000000000.woff2'],
]) {
  const manifestResponse = await fetch(`${base}/fonts/${directory}/${manifestName}`)
  assert.equal(manifestResponse.status, 200)
  const manifest = await manifestResponse.json()
  const url = `${base}/fonts/${directory}/${manifest.file || manifest.subsets[0].file}`
  const response = await fetch(url)
  assert.equal(response.status, 200, url)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', url)
  assert.match(response.headers.get('content-type'), /woff2/)
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), 'wOF2')
  assert(response.headers.get('etag'))
  const cached = await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } })
  assert.equal(cached.status, 304)
  assert.equal(cached.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const missing = await fetch(`${base}/fonts/${directory}/${missingFile}`)
  assert.equal(missing.status, 404)
  assert(!missing.headers.get('cache-control')?.includes('immutable'))
  for (const result of [response, cached, missing]) {
    assert.match(result.headers.get('content-security-policy'), /font-src 'self' data:/)
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(result.headers.get('x-frame-options'), 'DENY')
    assert.equal(result.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  }
}
console.log('PASS: Han, phonetic and symbols font MIME, cache, 304, 404 and security headers')
