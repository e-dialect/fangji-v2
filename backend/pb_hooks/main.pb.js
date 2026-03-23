/// <reference path="../pb_data/types.d.ts" />

// ============================================================
// Collection Access Rules
// ============================================================
//
// NOTE: The rules documented below are NOT automatically applied.
// They must be configured manually in the PocketBase Admin UI
// (Collections → API Rules) or encoded in a migration file.
// This file serves as the authoritative documentation of the
// intended access-control model; treat any discrepancy between
// this file and the Admin UI as a misconfiguration.
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

// Hook: enforce valid status transitions on pages to prevent race conditions.
//
// - pending → claimed:    only allowed when the page is still "pending"
// - proofread → reviewing: only allowed when the page is still "proofread"
//   (prevents two reviewers from simultaneously opening the same page)
onRecordBeforeUpdateRequest((e) => {
  const newStatus = e.record.getString("status")
  if (newStatus !== "claimed" && newStatus !== "reviewing") {
    return
  }
  const current = $app.dao().findRecordById("pages", e.record.id)
  const oldStatus = current.getString("status")

  if (newStatus === "claimed" && oldStatus !== "pending") {
    throw new BadRequestError("该任务已被其他校对员认领")
  }
  if (newStatus === "reviewing" && oldStatus !== "proofread") {
    throw new BadRequestError("该任务已被其他审核员占用")
  }
}, "pages")
