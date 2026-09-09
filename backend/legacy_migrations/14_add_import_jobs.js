/// <reference path="../pb_data/types.d.ts" />

// Durable CSV import jobs and structured row-level errors.
migrate((db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")
  const users = dao.findCollectionByNameOrId("users")
  const projectFiles = dao.findCollectionByNameOrId("project_files")

  const importJobs = new Collection({
    name: "import_jobs",
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
        name: "created_by",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      {
        name: "source_file",
        type: "file",
        required: true,
        options: {
          maxSelect: 1,
          maxSize: 50 * 1024 * 1024,
          mimeTypes: [],
          thumbs: []
        }
      },
      { name: "original_filename", type: "text", required: true, options: { min: 1, max: 500, pattern: "" } },
      { name: "file_hash", type: "text", required: true, options: { min: 64, max: 64, pattern: "^[a-f0-9]{64}$" } },
      { name: "file_size", type: "number", required: true, options: { min: 1, max: 50 * 1024 * 1024, noDecimal: true } },
      { name: "mode", type: "select", required: true, options: { maxSelect: 1, values: ["skip_invalid"] } },
      {
        name: "status",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["queued", "processing", "completed", "completed_with_errors", "failed"]
        }
      },
      { name: "total_count", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } },
      { name: "processed_count", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } },
      { name: "success_count", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } },
      { name: "failed_count", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } },
      { name: "error_code", type: "text", required: false, options: { min: null, max: 100, pattern: "" } },
      { name: "error_message", type: "text", required: false, options: { min: null, max: 2000, pattern: "" } },
      { name: "started_at", type: "date", required: false, options: {} },
      { name: "finished_at", type: "date", required: false, options: {} }
    ],
    indexes: [
      "CREATE INDEX idx_import_jobs_project_created ON import_jobs (project, created DESC)",
      "CREATE INDEX idx_import_jobs_status ON import_jobs (status)",
      "CREATE UNIQUE INDEX idx_import_jobs_dedup ON import_jobs (project, file_hash, mode) WHERE status != 'failed'"
    ],
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"'
  })
  dao.saveCollection(importJobs)

  const importErrors = new Collection({
    name: "import_job_errors",
    type: "base",
    schema: [
      {
        name: "job",
        type: "relation",
        required: true,
        options: {
          collectionId: importJobs.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["original_filename"]
        }
      },
      { name: "row_number", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } },
      { name: "column_name", type: "text", required: false, options: { min: null, max: 500, pattern: "" } },
      { name: "error_code", type: "text", required: true, options: { min: 1, max: 100, pattern: "" } },
      { name: "message", type: "text", required: true, options: { min: 1, max: 2000, pattern: "" } },
      { name: "raw_value", type: "text", required: false, options: { min: null, max: 1000, pattern: "" } },
      { name: "retryable", type: "bool", required: false, options: {} }
    ],
    indexes: [
      "CREATE INDEX idx_import_job_errors_job_row ON import_job_errors (job, row_number)"
    ],
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(importErrors)

  const pages = dao.findCollectionByNameOrId("pages")
  if (!pages.schema.getFieldByName("import_job")) {
    pages.schema.addField(new SchemaField({
      name: "import_job",
      type: "relation",
      required: false,
      options: {
        collectionId: importJobs.id,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
        displayFields: ["original_filename"]
      }
    }))
    pages.indexes = [
      ...pages.indexes,
      "CREATE INDEX idx_pages_import_job ON pages (import_job)"
    ]
    dao.saveCollection(pages)
  }

  const addProjectFileField = (field) => {
    if (!projectFiles.schema.getFieldByName(field.name)) {
      projectFiles.schema.addField(new SchemaField(field))
    }
  }

  addProjectFileField({ name: "file_hash", type: "text", required: false, options: { min: null, max: 64, pattern: "" } })
  addProjectFileField({ name: "file_size", type: "number", required: false, options: { min: 0, max: null, noDecimal: true } })
  addProjectFileField({ name: "error_code", type: "text", required: false, options: { min: null, max: 100, pattern: "" } })
  addProjectFileField({ name: "error_message", type: "text", required: false, options: { min: null, max: 2000, pattern: "" } })
  dao.saveCollection(projectFiles)
}, (db) => {
  const dao = new Dao(db)

  try {
    const pages = dao.findCollectionByNameOrId("pages")
    const field = pages.schema.getFieldByName("import_job")
    if (field) pages.schema.removeField(field.id)
    pages.indexes = pages.indexes.filter((index) => !index.includes("idx_pages_import_job"))
    dao.saveCollection(pages)
  } catch {}

  try {
    dao.deleteCollection(dao.findCollectionByNameOrId("import_job_errors"))
  } catch {}

  try {
    dao.deleteCollection(dao.findCollectionByNameOrId("import_jobs"))
  } catch {}

  try {
    const projectFiles = dao.findCollectionByNameOrId("project_files")
    for (const name of ["file_hash", "file_size", "error_code", "error_message"]) {
      const field = projectFiles.schema.getFieldByName(name)
      if (field) projectFiles.schema.removeField(field.id)
    }
    dao.saveCollection(projectFiles)
  } catch {}
})
