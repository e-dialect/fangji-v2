#!/bin/sh
set -eu

/pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations

if [ -n "${PB_ALLOWED_ORIGINS:-}" ]; then
  exec /pb/pocketbase serve \
    --http=0.0.0.0:8090 \
    --dir=/pb/pb_data \
    --migrationsDir=/pb/pb_migrations \
    --origins="${PB_ALLOWED_ORIGINS}"
fi

exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --migrationsDir=/pb/pb_migrations
