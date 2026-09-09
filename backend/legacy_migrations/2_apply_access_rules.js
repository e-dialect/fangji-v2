/// <reference path="../pb_data/types.d.ts" />

// Migration: apply collection API rules so role permissions are fixed in code.
migrate((db) => {
  const dao = new Dao(db)

  // users (built-in auth collection)
  const users = dao.findCollectionByNameOrId("users")
  users.listRule = '@request.auth.id != "" && @request.auth.role = "admin"'
  users.viewRule = '@request.auth.id != "" && (@request.auth.id = id || @request.auth.role = "admin")'
  users.createRule = "" // open registration
  users.updateRule = '@request.auth.id = id'
  users.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(users)

  // projects
  const projects = dao.findCollectionByNameOrId("projects")
  projects.listRule = '@request.auth.id != ""'
  projects.viewRule = '@request.auth.id != ""'
  projects.createRule = '@request.auth.role = "admin"'
  projects.updateRule = '@request.auth.role = "admin"'
  projects.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(projects)

  // project_files
  const projectFiles = dao.findCollectionByNameOrId("project_files")
  projectFiles.listRule = '@request.auth.id != ""'
  projectFiles.viewRule = '@request.auth.id != ""'
  projectFiles.createRule = '@request.auth.role = "admin"'
  projectFiles.updateRule = '@request.auth.role = "admin"'
  projectFiles.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(projectFiles)

  // pages
  const pages = dao.findCollectionByNameOrId("pages")
  pages.listRule = '@request.auth.id != ""'
  pages.viewRule = '@request.auth.id != ""'
  pages.createRule = '@request.auth.role = "admin"'
  // Update permission by role:
  // - admin: all
  // - proofreader: can claim pending pages, and can edit own claimed/proofreading/rejected pages
  // - reviewer: can take proofread pages for review, and can operate on own reviewing pages
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

  // Revert to unlocked defaults (admin-only when null).
  for (const name of ["users", "projects", "project_files", "pages"]) {
    const col = dao.findCollectionByNameOrId(name)
    col.listRule = null
    col.viewRule = null
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null
    dao.saveCollection(col)
  }
})
