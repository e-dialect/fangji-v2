/// <reference path="../pb_data/types.d.ts" />

// Migration patch: enforce pages collection rules for existing databases.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  pages.listRule = '@request.auth.id != ""'
  pages.viewRule = '@request.auth.id != ""'
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && status = "pending")',
    '|| (@request.auth.role = "proofreader" && proofreader = @request.auth.id && (status = "claimed" || status = "proofreading" || status = "rejected"))',
    '|| (@request.auth.role = "reviewer" && status = "proofread")',
    '|| (@request.auth.role = "reviewer" && reviewer = @request.auth.id && status = "reviewing")'
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
