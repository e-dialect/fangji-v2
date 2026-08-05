/// <reference path="../pb_data/types.d.ts" />

// Add a durable CSV inspection phase so the browser uploads the source file
// once, reviews backend-derived metadata, and then commits the same job.
migrate((db) => {
  const dao = new Dao(db)
  const jobs = dao.findCollectionByNameOrId("import_jobs")
  const status = jobs.schema.getFieldByName("status")
  for (const value of ["inspecting", "validated"]) {
    if (status && !status.options.values.includes(value)) status.options.values.push(value)
  }
  if (!jobs.schema.getFieldByName("inspection_json")) {
    jobs.schema.addField(new SchemaField({
      name: "inspection_json",
      type: "text",
      required: false,
      options: { min: null, max: null, pattern: "" }
    }))
  }
  dao.saveCollection(jobs)
}, (db) => {
  const dao = new Dao(db)
  const jobs = dao.findCollectionByNameOrId("import_jobs")
  const status = jobs.schema.getFieldByName("status")
  if (status) {
    status.options.values = status.options.values.filter(
      (value) => !["inspecting", "validated"].includes(value)
    )
  }
  const inspection = jobs.schema.getFieldByName("inspection_json")
  if (inspection) jobs.schema.removeField(inspection.id)
  dao.saveCollection(jobs)
})
