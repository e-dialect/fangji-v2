/// <reference path="../pb_data/types.d.ts" />

// Migration patch: enforce projects read/write rules again for environments
// where old manual rules still remain in database state.
migrate((db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")

  // Read: any authenticated user.
  projects.listRule = '@request.auth.id != ""'
  projects.viewRule = '@request.auth.id != ""'

  // Write: admin only.
  projects.createRule = '@request.auth.role = "admin"'
  projects.updateRule = '@request.auth.role = "admin"'
  projects.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(projects)
}, (db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")

  projects.listRule = null
  projects.viewRule = null
  projects.createRule = null
  projects.updateRule = null
  projects.deleteRule = null

  dao.saveCollection(projects)
})
