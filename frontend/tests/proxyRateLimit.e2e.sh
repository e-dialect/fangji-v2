#!/bin/sh
set -eu

network_name="fangji-proxy-rate-limit-ci"
backend_name="fangji-backend-proxy-ci"
frontend_name="fangji-frontend-proxy-ci"

cleanup() {
  docker rm -f "$frontend_name" "$backend_name" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
cleanup

docker network create "$network_name" >/dev/null
proxy_network_cidr="$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' "$network_name")"
docker run -d \
  --name "$backend_name" \
  --network "$network_name" \
  --network-alias backend \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  --tmpfs /pb/pb_data:rw,uid=10001,gid=10001,mode=0700 \
  -e HINGHWA_IDENTITY_BASE_URL=https://127.0.0.1:1 \
  -e TRUSTED_PROXY_CIDRS="$proxy_network_cidr" \
  fangji-backend:ci >/dev/null

backend_ready=false
for _ in $(seq 1 60); do
  if docker exec "$backend_name" curl --fail --silent http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  sleep 1
done
if [ "$backend_ready" != true ]; then
  docker logs "$backend_name"
  echo "Backend did not become ready." >&2
  exit 1
fi

docker run -d \
  --name "$frontend_name" \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --network "$network_name" \
  -p 127.0.0.1:18080:8080 \
  -e TRUSTED_PROXY_CIDRS="$proxy_network_cidr" \
  fangji-frontend:ci >/dev/null

frontend_ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/healthz >/dev/null 2>&1; then
    frontend_ready=true
    break
  fi
  sleep 1
done
if [ "$frontend_ready" != true ]; then
  docker logs "$frontend_name"
  echo "Frontend did not become ready." >&2
  exit 1
fi

test "$(docker exec "$backend_name" id -u)" = 10001
test "$(docker exec "$frontend_name" id -u)" != 0
# Verify the runtime font files are served as fonts, with cache/security headers.
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:18080'
const manifest = await (await fetch(`${base}/fonts/rare-han/manifest.json`)).json()
const url = `${base}/fonts/rare-han/${manifest.subsets[0].file}`
const response = await fetch(url)
assert.equal(response.status, 200)
assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
assert.match(response.headers.get('content-type'), /woff2/)
assert.match(response.headers.get('content-security-policy'), /font-src 'self' data:/)
assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), 'wOF2')
const cached = await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } })
assert.equal(cached.status, 304)
const missing = await fetch(`${base}/fonts/rare-han/rare-1234-000000000000.woff2`)
assert.equal(missing.status, 404)
assert(!missing.headers.get('cache-control')?.includes('immutable'))
console.log('Font MIME, immutable caching, conditional cache, CSP and missing-file checks passed.')
NODE

login_status() {
  client_ip="$1"
  spoofed_xff="$2"
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --header "X-Real-IP: ${client_ip}" \
    --header "X-Forwarded-For: ${spoofed_xff}" \
    --data '{"identity":"proxy-test","password":"proxy-test-password"}' \
    http://127.0.0.1:18080/api/fangji/auth/external/hinghwa/login
}

attempt=1
while [ "$attempt" -le 10 ]; do
  status="$(login_status 203.0.113.20 "198.51.100.${attempt}")"
  if [ "$status" != 502 ]; then
    echo "Attempt ${attempt} returned ${status}; expected provider-unavailable 502." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
done

status="$(login_status 203.0.113.20 198.51.100.250)"
if [ "$status" != 429 ]; then
  echo "Rotating forged X-Forwarded-For bypassed the client limit: ${status}." >&2
  exit 1
fi

status="$(login_status 203.0.113.21 198.51.100.250)"
if [ "$status" != 502 ]; then
  echo "An independent client incorrectly shared the first client's limit: ${status}." >&2
  exit 1
fi

echo "Nginx trusted-proxy rate-limit integration test passed."

# Disabled UI must also cover the no-slash URL (not the Vue application).
for admin_path in /_ /_/; do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:18080${admin_path}")"
  test "$status" = 404 || { echo "Disabled admin path returned $status: $admin_path" >&2; exit 1; }
done

docker rm -f "$frontend_name" >/dev/null
docker run -d --name "$frontend_name" --cap-drop ALL --security-opt no-new-privileges:true --network "$network_name" \
  -p 127.0.0.1:18080:8080 -e ENABLE_POCKETBASE_ADMIN_UI=true \
  -e TRUSTED_PROXY_CIDRS="$proxy_network_cidr" fangji-frontend:ci >/dev/null
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done

node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:18080'
const redirect = await fetch(`${base}/_`, { redirect: 'manual', headers: { Host: 'fangji.example.com', 'X-Forwarded-Proto': 'https' } })
assert.equal(redirect.status, 308)
assert.equal(redirect.headers.get('location'), '/_/')
const ui = await fetch(`${base}/_/`)
assert.equal(ui.status, 200)
const html = await ui.text()
assert.match(html, /PocketBase/)
const script = html.match(/<script[^>]+src="([^"]+)"/)
assert(script, 'PocketBase UI must reference a script')
const asset = await fetch(new URL(script[1], `${base}/_/`))
assert.equal(asset.status, 200)
assert.match(asset.headers.get('content-type'), /javascript/)
const protectedApi = await fetch(`${base}/api/settings`)
assert([401, 403].includes(protectedApi.status), 'Enabling UI must not bypass administrator authentication')
console.log('PocketBase administrator UI: disabled paths, relative HTTPS-safe redirect, UI/assets and protected API checks passed.')
NODE
