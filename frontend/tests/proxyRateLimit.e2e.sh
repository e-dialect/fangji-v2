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
  -e HINGHWA_IDENTITY_BASE_URL=https://127.0.0.1:1 \
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
  --network "$network_name" \
  -p 127.0.0.1:18080:80 \
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
