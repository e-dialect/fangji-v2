#!/bin/sh
set -eu

run_migration_file() {
  migration_file="$1"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
  cp "$migration_file" "$tmp_dir/"
  echo "Running PocketBase migration: $(basename "$migration_file")"
  FANGJI_SKIP_ADMIN_BOOTSTRAP=1 /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir="$tmp_dir"
  rm -rf "$tmp_dir"
  trap - EXIT HUP INT TERM
}

# PocketBase sorts migration filenames lexicographically, which would run
# 10_add_structured_csv_fields.js before 1_init_schema.js on a fresh database.
# Run them one file at a time in numeric-prefix order while preserving the
# original filenames recorded in the _migrations table.
find /pb/pb_migrations -maxdepth 1 -type f -name '*.js' \
  | awk '{
      path = $0
      name = path
      sub(".*/", "", name)
      if (match(name, /^[0-9]+/)) {
        print substr(name, RSTART, RLENGTH) "\t" path
      } else {
        print "999999\t" path
      }
    }' \
  | sort -n -k1,1 -k2,2 \
  | cut -f2- \
  | while IFS= read -r migration_file
do
  run_migration_file "$migration_file"
done

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
