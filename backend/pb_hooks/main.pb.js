/// <reference path="../pb_data/types.d.ts" />

// ============================================================
// Collection Access Rules
// ============================================================
//
// These rules are applied via PocketBase collection API rules.
// Below is the documentation of intended rules to be set in the
// PocketBase Admin UI or via migrations.
//
// users (built-in _pb_users_auth_):
//   - listRule:   @request.auth.id != "" && @request.auth.role = "admin"
//   - viewRule:   @request.auth.id != "" && (@request.auth.id = id || @request.auth.role = "admin")
//   - createRule: ""   (open registration)
//   - updateRule: @request.auth.id = id
//   - deleteRule: @request.auth.role = "admin"
//
// projects:
//   - listRule:   @request.auth.id != ""
//   - viewRule:   @request.auth.id != ""
//   - createRule: @request.auth.role = "admin"
//   - updateRule: @request.auth.role = "admin"
//   - deleteRule: @request.auth.role = "admin"
//
// project_files:
//   - listRule:   @request.auth.id != ""
//   - viewRule:   @request.auth.id != ""
//   - createRule: @request.auth.role = "admin"
//   - updateRule: @request.auth.role = "admin"
//   - deleteRule: @request.auth.role = "admin"
//
// pages:
//   - listRule:   @request.auth.id != ""
//   - viewRule:   @request.auth.id != ""
//   - createRule: @request.auth.role = "admin"
//   - updateRule: @request.auth.id != ""
//   - deleteRule: @request.auth.role = "admin"

// Hook: when a project_file is created, log it (actual OCR processing
// would be done by an external worker or manual upload)
onRecordAfterCreateRequest((e) => {
  console.log("New project_file uploaded:", e.record.getId())
}, "project_files")
