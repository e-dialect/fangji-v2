/// <reference path="../pb_data/types.d.ts" />

// Migration:
// - remove the reviewer role from the active product workflow
// - add first/second proofreading fields to pages
// - make page rules support project-based two-pass proofreading
migrate((db) => {
  const dao = new Dao(db)

  const users = dao.findCollectionByNameOrId("users")
  const roleField = users.schema.getFieldByName("role")
  if (roleField) {
    roleField.options.values = ["admin", "proofreader"]
  }
  dao.saveCollection(users)

  const formerReviewers = dao.findRecordsByFilter(
    "users",
    'role = "reviewer"',
    "created",
    1000000,
    0
  )
  for (const user of formerReviewers) {
    user.set("role", "proofreader")
    dao.saveRecord(user)
  }

  const pages = dao.findCollectionByNameOrId("pages")

  function addFieldIfMissing(field) {
    if (!pages.schema.getFieldByName(field.name)) {
      pages.schema.addField(new SchemaField(field))
    }
  }

  addFieldIfMissing({
    name: "first_proofreader",
    type: "relation",
    required: false,
    options: { collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["email"] }
  })
  addFieldIfMissing({
    name: "first_proofread_text",
    type: "text",
    required: false,
    options: { min: null, max: null, pattern: "" }
  })
  addFieldIfMissing({
    name: "first_proofread_row_json",
    type: "text",
    required: false,
    options: { min: null, max: null, pattern: "" }
  })
  addFieldIfMissing({
    name: "first_proofread_at",
    type: "date",
    required: false,
    options: {}
  })
  addFieldIfMissing({
    name: "second_proofreader",
    type: "relation",
    required: false,
    options: { collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ["email"] }
  })
  addFieldIfMissing({
    name: "second_proofread_text",
    type: "text",
    required: false,
    options: { min: null, max: null, pattern: "" }
  })
  addFieldIfMissing({
    name: "second_proofread_row_json",
    type: "text",
    required: false,
    options: { min: null, max: null, pattern: "" }
  })
  addFieldIfMissing({
    name: "second_proofread_at",
    type: "date",
    required: false,
    options: {}
  })
  addFieldIfMissing({
    name: "proofread_round",
    type: "number",
    required: false,
    options: { min: 1, max: null, noDecimal: true }
  })
  addFieldIfMissing({
    name: "mismatch_count",
    type: "number",
    required: false,
    options: { min: 0, max: null, noDecimal: true }
  })
  addFieldIfMissing({
    name: "last_mismatch_at",
    type: "date",
    required: false,
    options: {}
  })

  // Proofreaders can see project queues, claimable second-pass pages, and their
  // own active pages. Admin keeps full access.
  const readRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| @request.auth.role = "proofreader"',
    ')'
  ].join(" ")

  pages.listRule = readRule
  pages.viewRule = readRule
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || status = "proofread" || proofreader = @request.auth.id))'
  ].join(" ")
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)

  const existingPages = dao.findRecordsByFilter("pages", "id != \"\"", "created", 1000000, 0)
  for (const page of existingPages) {
    const status = page.getString("status")
    if (!page.getInt("proofread_round")) {
      page.set("proofread_round", 1)
    }
    if (!page.getInt("mismatch_count")) {
      page.set("mismatch_count", 0)
    }
    if ((status === "approved" || status === "proofread") && page.getString("proofreader") && !page.getString("first_proofreader")) {
      page.set("first_proofreader", page.getString("proofreader"))
      page.set("first_proofread_text", page.getString("proofread_text"))
      page.set("first_proofread_row_json", page.getString("proofread_row_json"))
      page.set("first_proofread_at", page.get("proofread_at"))
    }
    if (status === "reviewing") {
      page.set("status", "proofread")
      page.set("reviewer", "")
    }
    dao.saveRecord(page)
  }
}, (db) => {
  const dao = new Dao(db)

  const users = dao.findCollectionByNameOrId("users")
  const roleField = users.schema.getFieldByName("role")
  if (roleField) {
    roleField.options.values = ["admin", "proofreader", "reviewer"]
  }
  dao.saveCollection(users)

  const pages = dao.findCollectionByNameOrId("pages")
  for (const name of [
    "first_proofreader",
    "first_proofread_text",
    "first_proofread_row_json",
    "first_proofread_at",
    "second_proofreader",
    "second_proofread_text",
    "second_proofread_row_json",
    "second_proofread_at",
    "proofread_round",
    "mismatch_count",
    "last_mismatch_at"
  ]) {
    try {
      const f = pages.schema.getFieldByName(name)
      if (f) pages.schema.removeField(f.id)
    } catch {}
  }

  pages.listRule = '@request.auth.id != ""'
  pages.viewRule = '@request.auth.id != ""'
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || proofreader = @request.auth.id))',
    '|| (@request.auth.role = "reviewer" && (status = "proofread" || reviewer = @request.auth.id))'
  ].join(" ")
  pages.deleteRule = '@request.auth.role = "admin"'

  dao.saveCollection(pages)
})
