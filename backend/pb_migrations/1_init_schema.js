/// <reference path="../pb_data/types.d.ts" />

// Migration: Initial schema for Fangji v2 dialect proofreading platform
migrate((db) => {
  // 1. Extend the built-in 'users' collection with a 'role' and 'name' field
  const usersCollection = $app.dao().findCollectionByNameOrId("users")

  usersCollection.schema.addField(new SchemaField({
    name: "name",
    type: "text",
    required: false,
    options: { min: null, max: 100, pattern: "" }
  }))

  usersCollection.schema.addField(new SchemaField({
    name: "role",
    type: "select",
    required: true,
    options: {
      maxSelect: 1,
      values: ["admin", "proofreader", "reviewer"]
    }
  }))

  $app.dao().saveCollection(usersCollection)

  // 2. projects collection
  const projects = new Collection({
    name: "projects",
    type: "base",
    schema: [
      { name: "name", type: "text", required: true, options: { min: 1, max: 500, pattern: "" } },
      { name: "description", type: "text", required: false, options: { min: null, max: 2000, pattern: "" } },
      { name: "admin", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["email"] } }
    ]
  })

  $app.dao().saveCollection(projects)

  // 3. project_files collection
  const projectFiles = new Collection({
    name: "project_files",
    type: "base",
    schema: [
      { name: "project", type: "relation", required: true, options: { collectionId: projects.id, cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: ["name"] } },
      { name: "file", type: "file", required: false, options: { maxSelect: 1, maxSize: 50 * 1024 * 1024 /* 50 MB */, mimeTypes: ["application/pdf"], thumbs: [] } },
      { name: "original_filename", type: "text", required: false, options: { min: null, max: 500, pattern: "" } },
      { name: "status", type: "select", required: true, options: { maxSelect: 1, values: ["processing", "ready", "error"] } }
    ]
  })

  $app.dao().saveCollection(projectFiles)

  // 4. pages collection
  const pages = new Collection({
    name: "pages",
    type: "base",
    schema: [
      { name: "project", type: "relation", required: true, options: { collectionId: projects.id, cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: ["name"] } },
      { name: "project_file", type: "relation", required: false, options: { collectionId: projectFiles.id, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["original_filename"] } },
      { name: "page_number", type: "number", required: true, options: { min: 1, max: null, noDecimal: true } },
      { name: "image", type: "file", required: false, options: { maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: [] } },
      { name: "ocr_text", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { name: "proofread_text", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { name: "status", type: "select", required: true, options: { maxSelect: 1, values: ["pending", "claimed", "proofreading", "proofread", "reviewing", "approved", "rejected"] } },
      { name: "proofreader", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["email"] } },
      { name: "reviewer", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["email"] } },
      { name: "proofread_at", type: "date", required: false, options: {} },
      { name: "reviewed_at", type: "date", required: false, options: {} }
    ]
  })

  $app.dao().saveCollection(pages)

}, (db) => {
  // Revert: drop collections in reverse order
  try { $app.dao().deleteCollection($app.dao().findCollectionByNameOrId("pages")) } catch {}
  try { $app.dao().deleteCollection($app.dao().findCollectionByNameOrId("project_files")) } catch {}
  try { $app.dao().deleteCollection($app.dao().findCollectionByNameOrId("projects")) } catch {}
})
