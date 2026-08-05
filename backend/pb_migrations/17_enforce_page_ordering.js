/// <reference path="../pb_data/types.d.ts" />

// Page numbers are the stable project-local order. Normalize legacy data
// before enforcing uniqueness so concurrent admin operations cannot create
// duplicate positions.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  const projects = dao.findRecordsByFilter("projects", 'id != ""', "created", 100000, 0)

  for (const project of projects) {
    const records = dao.findRecordsByFilter(
      "pages",
      `project = "${project.getId()}"`,
      "page_number,created",
      100000,
      0
    )
    records.forEach((record, index) => {
      record.set("page_number", index + 1)
      dao.saveRecord(record)
    })
  }

  if (!pages.indexes.some((index) => index.includes("idx_pages_project_page_number"))) {
    pages.indexes = [
      ...pages.indexes,
      "CREATE UNIQUE INDEX idx_pages_project_page_number ON pages (project, page_number)"
    ]
    dao.saveCollection(pages)
  }
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  pages.indexes = pages.indexes.filter((index) => !index.includes("idx_pages_project_page_number"))
  dao.saveCollection(pages)
})
