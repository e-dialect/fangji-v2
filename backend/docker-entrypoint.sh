#!/bin/sh
set -eu

run_migration_file() {
  migration_file="$1"
  tmp_dir="$(mktemp -d)"
  cp "$migration_file" "$tmp_dir/"
  echo "Running PocketBase migration: $(basename "$migration_file")"
  FANGJI_SKIP_ADMIN_BOOTSTRAP=1 /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir="$tmp_dir"
  rm -rf "$tmp_dir"
}

# PocketBase sorts migration filenames lexicographically, which would run
# 10_add_structured_csv_fields.js before 1_init_schema.js on a fresh database.
# Run them one file at a time in numeric order while preserving the original
# filenames recorded in the _migrations table.
for migration_file in \
  /pb/pb_migrations/1_init_schema.js \
  /pb/pb_migrations/2_apply_access_rules.js \
  /pb/pb_migrations/3_fix_projects_access_rules.js \
  /pb/pb_migrations/4_enforce_projects_read_rules.js \
  /pb/pb_migrations/5_enforce_pages_read_rules.js \
  /pb/pb_migrations/6_fix_pages_update_rule_for_claiming.js \
  /pb/pb_migrations/7_add_pdf_page_and_harden_pages_rules.js \
  /pb/pb_migrations/8_harden_pages_view_rule.js \
  /pb/pb_migrations/9_fix_pages_view_rule_for_claiming.js \
  /pb/pb_migrations/10_add_structured_csv_fields.js \
  /pb/pb_migrations/11_two_pass_project_proofreading.js \
  /pb/pb_migrations/12_reapply_two_pass_access_rules.js
do
  if [ -f "$migration_file" ]; then
    run_migration_file "$migration_file"
  fi
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
