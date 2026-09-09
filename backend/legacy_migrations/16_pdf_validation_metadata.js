/// <reference path="../pb_data/types.d.ts" />

// Persist backend PDF validation metadata and make the active source PDF
// explicit while retaining superseded files for audit/history.
migrate((db) => {
  const dao = new Dao(db)
  const files = dao.findCollectionByNameOrId("project_files")
  const addField = (field) => {
    if (!files.schema.getFieldByName(field.name)) {
      files.schema.addField(new SchemaField(field))
    }
  }
  addField({ name: "page_count", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } })
  addField({ name: "validation_tool", type: "text", required: false, options: { min: null, max: 100, pattern: "" } })
  addField({ name: "validated_at", type: "date", required: false, options: {} })
  addField({ name: "is_primary", type: "bool", required: false, options: {} })
  addField({ name: "superseded_at", type: "date", required: false, options: {} })
  if (!files.indexes.some((index) => index.includes("idx_project_files_primary"))) {
    files.indexes = [
      ...files.indexes,
      "CREATE UNIQUE INDEX idx_project_files_primary ON project_files (project) WHERE is_primary = 1"
    ]
  }
  dao.saveCollection(files)

  const readyFiles = dao.findRecordsByFilter("project_files", 'status = "ready"', "project,-created", 100000, 0)
  const seenProjects = new Set()
  for (const record of readyFiles) {
    const project = record.getString("project")
    const primary = project && !seenProjects.has(project)
    record.set("is_primary", primary)
    if (primary) seenProjects.add(project)
    dao.saveRecord(record)
  }
}, (db) => {
  const dao = new Dao(db)
  const files = dao.findCollectionByNameOrId("project_files")
  files.indexes = files.indexes.filter((index) => !index.includes("idx_project_files_primary"))
  for (const name of ["page_count", "validation_tool", "validated_at", "is_primary", "superseded_at"]) {
    const field = files.schema.getFieldByName(name)
    if (field) files.schema.removeField(field.id)
  }
  dao.saveCollection(files)
})
