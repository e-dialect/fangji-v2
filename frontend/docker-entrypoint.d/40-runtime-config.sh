#!/bin/sh
set -eu

if [ -z "${PB_URL:-}" ]; then
  echo "PB_URL is empty; frontend will use window.location.origin."
  exit 0
fi

escaped_pb_url="$(printf '%s' "$PB_URL" | sed -e 's/[\/&]/\\&/g')"

find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -exec sed -i "s|__FANGJI_PB_URL__|${escaped_pb_url}|g" {} +

echo "Configured frontend PocketBase URL: ${PB_URL}"
