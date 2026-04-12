/// <reference path="../pb_data/types.d.ts" />

// Migration patch: split list/view rules for pages.
// Goal:
// - keep list visibility needed by task halls
// - restrict getOne/view to owned-or-actionable tasks only
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

  // proofreader: only own tasks can open detail page
  // reviewer: own tasks and claimable proofread tasks can open detail page
  pages.viewRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && proofreader = @request.auth.id)',
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
