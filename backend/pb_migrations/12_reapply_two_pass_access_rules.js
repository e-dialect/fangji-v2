/// <reference path="../pb_data/types.d.ts" />

// Reapply the current two-pass proofreading access rules.
//
// Some local PocketBase data volumes may have been created before the
// proofreader-only second-pass workflow. This migration intentionally repeats
// the active rules so those databases can accept proofread -> claimed updates
// from a different proofreader.
migrate((db) => {
  const dao = new Dao(db)

  const users = dao.findCollectionByNameOrId("users")
  const roleField = users.schema.getFieldByName("role")
  if (roleField) {
    roleField.options.values = ["admin", "proofreader"]
  }
  dao.saveCollection(users)

  const formerReviewers = dao.findRecordsByFilter(
    "users",
    'role = "reviewer"',
    "created",
    1000000,
    0
  )
  for (const user of formerReviewers) {
    user.set("role", "proofreader")
    dao.saveRecord(user)
  }

  const pages = dao.findCollectionByNameOrId("pages")
  const readRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| @request.auth.role = "proofreader"',
    ')'
  ].join(" ")

  pages.listRule = readRule
  pages.viewRule = readRule
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || status = "proofread" || proofreader = @request.auth.id))'
  ].join(" ")
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)
}, (db) => {
  const dao = new Dao(db)

  const users = dao.findCollectionByNameOrId("users")
  const roleField = users.schema.getFieldByName("role")
  if (roleField) {
    roleField.options.values = ["admin", "proofreader", "reviewer"]
  }
  dao.saveCollection(users)

  const pages = dao.findCollectionByNameOrId("pages")
  pages.listRule = '@request.auth.id != ""'
  pages.viewRule = '@request.auth.id != ""'
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))'
  ].join(" ")
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)
})
