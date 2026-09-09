/// <reference path="../pb_data/types.d.ts" />

// External accounts are deliberately mapped by provider subject. Profile
// fields are not copied to users, and the mapping collection is server-only.
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId("users")

  const mappings = new Collection({
    name: "external_identity_mappings",
    type: "base",
    schema: [
      {
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["username"]
        }
      },
      {
        name: "provider",
        type: "text",
        required: true,
        options: { min: 2, max: 64, pattern: "^[a-z][a-z0-9_-]+$" }
      },
      {
        name: "subject",
        type: "text",
        required: true,
        options: { min: 1, max: 255, pattern: "" }
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_external_identity_subject ON external_identity_mappings (provider, subject)",
      "CREATE UNIQUE INDEX idx_external_identity_user_provider ON external_identity_mappings (user, provider)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(mappings)
}, (db) => {
  const dao = new Dao(db)
  try { dao.deleteCollection(dao.findCollectionByNameOrId("external_identity_mappings")) } catch {}
})
