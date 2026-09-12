// Register in collection metadata so later schema saves retain the index.
migrate((app) => {
  const pages = app.findCollectionByNameOrId("pages")
  pages.indexes = [...pages.indexes, "CREATE INDEX idx_pages_pdf_affinity ON pages(project,project_file,pdf_page,status,page_number,id)"]
  app.save(pages)
}, (app) => {
  const pages = app.findCollectionByNameOrId("pages")
  pages.indexes = pages.indexes.filter(sql => !sql.includes("idx_pages_pdf_affinity"))
  app.save(pages)
})
