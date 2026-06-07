#!/bin/sh
set -eu

backend_url="${VITE_BACKEND_URL:-${PB_URL:-}}"

if [ -z "$backend_url" ]; then
  echo "VITE_BACKEND_URL is empty; frontend will use window.location.origin."
  exit 0
fi

escaped_backend_url="$(printf '%s' "$backend_url" | sed -e 's/[\/&]/\\&/g')"

find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -exec sed -i "s|VITE_BACKEND_URL_RUNTIME_REPLACEMENT|${escaped_backend_url}|g" {} +

echo "Configured frontend backend URL: ${backend_url}"
