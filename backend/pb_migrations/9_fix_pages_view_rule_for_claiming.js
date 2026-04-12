/// <reference path="../pb_data/types.d.ts" />

// Migration patch: keep pages viewRule compatible with claiming flow.
// Proofreader must be able to view pending records to claim them.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  pages.listRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))',
    ')'
  ].join(" ")

  // Allow proofreader to view pending records (needed for claim update by id).
  pages.viewRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))',
    ')'
  ].join(" ")

  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))'
  ].join(" ")
  pages.createRule = '@request.auth.role = "admin"'
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  pages.listRule = null
  pages.viewRule = null
  pages.createRule = null
  pages.updateRule = null
  pages.deleteRule = null
  dao.saveCollection(pages)
})
