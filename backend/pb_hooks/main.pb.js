/// <reference path="../pb_data/types.d.ts" />

// ============================================================
// Collection Access Rules
// ============================================================
//
// NOTE:
// - Collection API rules are now applied by migration:
//   backend/pb_migrations/2_apply_access_rules.js
// - This file keeps role-policy documentation and runtime hooks
//   (such as status transition concurrency checks).
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
//   - updateRule:
//       admin 全量可更新
//       proofreader 可认领 pending，且可更新自己负责的 claimed/proofreading/rejected
//       reviewer 可领取 proofread，且可更新自己负责的 reviewing
//   - deleteRule: @request.auth.role = "admin"

// Hook: when a project_file is created, log it (actual OCR processing
// would be done by an external worker or manual upload)
onRecordAfterCreateRequest((e) => {
  console.log("New project_file uploaded:", e.record.getId())
}, "project_files")

// Hook: force public registration users to proofreader role.
// This keeps role assignment fixed and prevents privilege escalation at signup.
onRecordBeforeCreateRequest((e) => {
  e.record.set("role", "proofreader")
}, "users")

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
  const recordId = e.record.getId()
  if (!recordId) {
    throw new BadRequestError("无效的页面记录ID")
  }

  let current = null
  try {
    current = $app.dao().findRecordById("pages", recordId)
  } catch {
    throw new BadRequestError("页面记录不存在或已被删除")
  }

  const oldStatus = current.getString("status")

  if (newStatus === "claimed" && oldStatus !== "pending") {
    throw new BadRequestError("该任务已被其他校对员认领")
  }
  if (newStatus === "reviewing" && oldStatus !== "proofread") {
    throw new BadRequestError("该任务已被其他审核员占用")
  }
}, "pages")
