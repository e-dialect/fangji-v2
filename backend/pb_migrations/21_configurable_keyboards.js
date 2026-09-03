/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId("users")
  const projects = dao.findCollectionByNameOrId("projects")

  const keyboards = new Collection({
    name: "keyboards",
    type: "base",
    schema: [
      { name: "keyboard_id", type: "text", required: true, options: { min: 2, max: 64, pattern: "^[a-z][a-z0-9-]+$" } },
      { name: "schema_version", type: "number", required: true, options: { min: 1, max: 1000, noDecimal: true } },
      { name: "name", type: "text", required: true, options: { min: 1, max: 100 } },
      { name: "description", type: "text", required: false, options: { max: 500 } },
      { name: "definition_json", type: "text", required: true, options: { min: 2, max: 200000 } },
      { name: "origin", type: "select", required: true, options: { maxSelect: 1, values: ["preset", "upload"] } },
      {
        name: "uploaded_by",
        type: "relation",
        required: false,
        options: {
          collectionId: users.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      { name: "active", type: "bool", required: false, options: {} },
      { name: "source_hash", type: "text", required: true, options: { min: 64, max: 64, pattern: "^[a-f0-9]{64}$" } }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_keyboard_id ON keyboards (keyboard_id)",
      "CREATE INDEX idx_keyboard_origin_active ON keyboards (origin, active)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(keyboards)

  const projectKeyboards = new Collection({
    name: "project_keyboards",
    type: "base",
    schema: [
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
        name: "keyboard",
        type: "relation",
        required: true,
        options: {
          collectionId: keyboards.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["name"]
        }
      },
      { name: "enabled", type: "bool", required: false, options: {} },
      { name: "is_default", type: "bool", required: false, options: {} },
      { name: "sort_order", type: "number", required: true, options: { min: 0, max: 10000, noDecimal: true } }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_project_keyboard ON project_keyboards (project, keyboard)",
      "CREATE INDEX idx_project_keyboard_enabled ON project_keyboards (project, enabled, sort_order)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(projectKeyboards)
}, (db) => {
  const dao = new Dao(db)
  for (const name of ["project_keyboards", "keyboards"]) {
    try { dao.deleteCollection(dao.findCollectionByNameOrId(name)) } catch {}
  }
})
