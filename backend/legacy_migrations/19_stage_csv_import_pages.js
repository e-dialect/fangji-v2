/// <reference path="../pb_data/types.d.ts" />

// Keep CSV pages private and unclaimable until their import job reaches a
// terminal state. The import service publishes all staged pages atomically.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  const statusField = pages.schema.getFieldByName("status")
  if (statusField && !statusField.options.values.includes("importing")) {
    statusField.options.values.push("importing")
  }

  const readRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && status != "importing")',
    ')'
  ].join(" ")
  pages.listRule = readRule
  pages.viewRule = readRule
  dao.saveCollection(pages)
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  const staged = dao.findRecordsByFilter("pages", 'status = "importing"', "created", 1000000, 0)
  for (const page of staged) {
    page.set("status", "pending")
    dao.saveRecord(page)
  }

  const statusField = pages.schema.getFieldByName("status")
  if (statusField) {
    statusField.options.values = statusField.options.values.filter((value) => value !== "importing")
  }
  const readRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| @request.auth.role = "proofreader"',
    ')'
  ].join(" ")
  pages.listRule = readRule
  pages.viewRule = readRule
  dao.saveCollection(pages)
})
