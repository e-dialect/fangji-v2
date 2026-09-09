// Upgrade existing databases as well as fresh installations. Preserve all
// other field options, including protected access to the original PDF.
migrate((db) => {
  const dao = new Dao(db)
  const files = dao.findCollectionByNameOrId("project_files")
  files.schema.getFieldByName("file").options.maxSize = 100 * 1024 * 1024
  dao.saveCollection(files)
}, (db) => {
  const dao = new Dao(db)
  const files = dao.findCollectionByNameOrId("project_files")
  files.schema.getFieldByName("file").options.maxSize = 50 * 1024 * 1024
  dao.saveCollection(files)
})
