#!/bin/sh
set -eu

admin_ui_value="$(printf '%s' "${ENABLE_POCKETBASE_ADMIN_UI:-false}" | tr '[:upper:]' '[:lower:]')"

case "$admin_ui_value" in
  1|true|yes|on)
    admin_ui_mode="enabled"
    ;;
  0|false|no|off|'')
    admin_ui_mode="disabled"
    ;;
  *)
    echo "Invalid ENABLE_POCKETBASE_ADMIN_UI value: ${ENABLE_POCKETBASE_ADMIN_UI}" >&2
    exit 1
    ;;
esac

cp "/opt/fangji/nginx/pocketbase-admin-${admin_ui_mode}.conf" \
  /etc/nginx/snippets/pocketbase-admin.conf
echo "PocketBase Admin UI proxy: ${admin_ui_mode}"

trusted_proxy_cidrs="${TRUSTED_PROXY_CIDRS:-172.16.0.0/12}"
trusted_proxy_file="/etc/nginx/snippets/trusted-proxies.conf"
: > "$trusted_proxy_file"
old_ifs="$IFS"
IFS=','
for proxy_cidr in $trusted_proxy_cidrs; do
  proxy_cidr="$(printf '%s' "$proxy_cidr" | tr -d '[:space:]')"
  case "$proxy_cidr" in
    ''|*[!0-9A-Fa-f:./]*)
      echo "Invalid TRUSTED_PROXY_CIDRS entry: ${proxy_cidr}" >&2
      exit 1
      ;;
  esac
  printf 'set_real_ip_from %s;\n' "$proxy_cidr" >> "$trusted_proxy_file"
done
IFS="$old_ifs"
echo "Configured trusted proxy CIDRs."

backend_url="${VITE_BACKEND_URL:-${PB_URL:-}}"

if [ -z "$backend_url" ]; then
  echo "VITE_BACKEND_URL is empty; frontend will use window.location.origin."
  exit 0
fi

escaped_backend_url="$(printf '%s' "$backend_url" | sed -e 's/[\/&]/\\&/g')"

find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -exec sed -i "s|VITE_BACKEND_URL_RUNTIME_REPLACEMENT|${escaped_backend_url}|g" {} +

echo "Configured frontend backend URL: ${backend_url}"
