/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  const projects = dao.findCollectionByNameOrId("projects")
  const users = dao.findCollectionByNameOrId("users")

  pages.schema.addField(new SchemaField({
    name: "lease_expires_at",
    type: "date",
    required: false,
    options: {}
  }))
  dao.saveCollection(pages)

  // Existing in-progress pages predate tokenized leases. Return them to their
  // correct queue; browser drafts remain local and can be restored after a new
  // claim instead of silently creating an unverifiable lease.
  const legacyActive = dao.findRecordsByFilter(
    "pages",
    'status = "claimed" || status = "proofreading"',
    "created",
    1000000,
    0
  )
  for (const page of legacyActive) {
    page.set("status", page.getString("first_proofreader") ? "proofread" : "pending")
    page.set("proofreader", null)
    page.set("lease_expires_at", null)
    dao.saveRecord(page)
  }

  const leases = new Collection({
    name: "task_leases",
    type: "base",
    schema: [
      {
        name: "page",
        type: "relation",
        required: true,
        options: {
          collectionId: pages.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["page_number"]
        }
      },
      {
        name: "project",
        type: "relation",
        required: true,
        options: {
          collectionId: projects.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["name"]
        }
      },
      {
        name: "holder",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      { name: "token_hash", type: "text", required: true, options: { min: 64, max: 64, pattern: "^[a-f0-9]{64}$" } },
      { name: "expires_at", type: "date", required: true, options: {} },
      { name: "last_activity_at", type: "date", required: true, options: {} },
      { name: "queue_status", type: "select", required: true, options: { maxSelect: 1, values: ["pending", "proofread"] } }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_task_lease_page ON task_leases (page)",
      "CREATE INDEX idx_task_lease_project_expiry ON task_leases (project, expires_at)",
      "CREATE INDEX idx_task_lease_holder ON task_leases (holder, project)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(leases)
}, (db) => {
  const dao = new Dao(db)
  try { dao.deleteCollection(dao.findCollectionByNameOrId("task_leases")) } catch {}
  const pages = dao.findCollectionByNameOrId("pages")
  const field = pages.schema.getFieldByName("lease_expires_at")
  if (field) {
    pages.schema.removeField(field.id)
    dao.saveCollection(pages)
  }
})
