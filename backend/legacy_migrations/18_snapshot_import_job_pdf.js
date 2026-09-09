/// <reference path="../pb_data/types.d.ts" />

// Keep every inspected CSV job tied to the exact PDF used for page validation.
// A zero page limit with no project_file represents an intentional CSV-only job.
migrate((db) => {
  const dao = new Dao(db)
  const jobs = dao.findCollectionByNameOrId("import_jobs")
  const projectFiles = dao.findCollectionByNameOrId("project_files")

  if (!jobs.schema.getFieldByName("project_file")) {
    jobs.schema.addField(new SchemaField({
      name: "project_file",
      type: "relation",
      required: false,
      options: {
        collectionId: projectFiles.id,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
        displayFields: ["original_filename"]
      }
    }))
  }
  if (!jobs.schema.getFieldByName("pdf_page_limit")) {
    jobs.schema.addField(new SchemaField({
      name: "pdf_page_limit",
      type: "number",
      required: false,
      options: { min: 0, max: null, noDecimal: true }
    }))
  }
  if (!jobs.schema.getFieldByName("pdf_snapshot_captured")) {
    jobs.schema.addField(new SchemaField({
      name: "pdf_snapshot_captured",
      type: "bool",
      required: false,
      options: {}
    }))
  }
  jobs.indexes = [
    ...jobs.indexes.filter((index) => !index.includes("idx_import_jobs_dedup")),
    "CREATE UNIQUE INDEX idx_import_jobs_dedup ON import_jobs (project, file_hash, mode, COALESCE(project_file, '')) WHERE status != 'failed'"
  ]
  dao.saveCollection(jobs)
}, (db) => {
  const dao = new Dao(db)
  const jobs = dao.findCollectionByNameOrId("import_jobs")
  for (const name of ["project_file", "pdf_page_limit", "pdf_snapshot_captured"]) {
    const field = jobs.schema.getFieldByName(name)
    if (field) jobs.schema.removeField(field.id)
  }
  jobs.indexes = [
    ...jobs.indexes.filter((index) => !index.includes("idx_import_jobs_dedup")),
    "CREATE UNIQUE INDEX idx_import_jobs_dedup ON import_jobs (project, file_hash, mode) WHERE status != 'failed'"
  ]
  dao.saveCollection(jobs)
})
