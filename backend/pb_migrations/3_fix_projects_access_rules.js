/// <reference path="../pb_data/types.d.ts" />

// Migration patch: normalize projects access rules for existing databases.
// Why needed:
// - Applied migrations are not re-executed after file edits.
// - Some environments may still keep old/manual rules causing 403 on getOne().
migrate((db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")

  // Logged-in users can list/view projects (required by admin detail view and task expand).
  projects.listRule = '@request.auth.id != ""'
  projects.viewRule = '@request.auth.id != ""'

  // Only admin can mutate project records.
  projects.createRule = '@request.auth.role = "admin"'
  projects.updateRule = '@request.auth.role = "admin"'
  projects.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(projects)
}, (db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")

  // Revert to previous strict defaults if rollback is needed.
  projects.listRule = null
  projects.viewRule = null
  projects.createRule = null
  projects.updateRule = null
  projects.deleteRule = null

  dao.saveCollection(projects)
})
