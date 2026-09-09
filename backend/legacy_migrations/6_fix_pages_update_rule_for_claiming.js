/// <reference path="../pb_data/types.d.ts" />

// Migration patch: make pages claiming/updating rules robust for proofreader/reviewer.
// Notes:
// - updateRule is evaluated against current record state.
// - status transition race protection still relies on pb_hooks/main.pb.js.
migrate((db) => {
  const dao = new Dao(db)
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
