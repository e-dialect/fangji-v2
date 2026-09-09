/// <reference path="../pb_data/types.d.ts" />

// Migration:
// 1) add pdf_page field to pages (source PDF page mapping from CSV)
// 2) harden pages read/update rules by role ownership visibility
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  const hasPdfPage = !!pages.schema.getFieldByName("pdf_page")
  if (!hasPdfPage) {
    pages.schema.addField(new SchemaField({
      name: "pdf_page",
      type: "number",
      required: false,
      options: {
        min: 1,
        max: null,
        noDecimal: true
      }
    }))
  }

  // Admin can read all pages.
  // Proofreader can read pending tasks + own tasks.
  // Reviewer can read proofread tasks + own review tasks.
  const readRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))',
    ')'
  ].join(" ")

  pages.listRule = readRule
  pages.viewRule = readRule
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))'
  ].join(" ")
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)

  // Backfill pdf_page for existing records from page_number where missing.
  const allPages = dao.findRecordsByFilter(
    "pages",
    "pdf_page = null || pdf_page = 0",
    "created",
    1000000,
    0
  )
  for (const r of allPages) {
    const pageNo = r.getInt("page_number")
    if (pageNo > 0) {
      r.set("pdf_page", pageNo)
      dao.saveRecord(r)
    }
  }
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  // Remove pdf_page if rollback.
  try {
    const pdfPageField = pages.schema.getFieldByName("pdf_page")
    if (pdfPageField) {
      pages.schema.removeField(pdfPageField.id)
    }
  } catch {}

  pages.listRule = null
  pages.viewRule = null
  pages.createRule = null
  pages.updateRule = null
  pages.deleteRule = null
  dao.saveCollection(pages)
})
