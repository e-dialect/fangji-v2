/// <reference path="../pb_data/types.d.ts" />

// Phase 1 proofreading integrity:
// - persist every proofreading attempt instead of deleting mismatches
// - introduce an explicit arbitration state
// - make page writes admin-only (proofreader transitions use custom atomic routes)
// - migrate legacy first/second pass payloads into the attempts collection
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  const users = dao.findCollectionByNameOrId("users")
  const projects = dao.findCollectionByNameOrId("projects")

  const statusField = pages.schema.getFieldByName("status")
  if (statusField && !statusField.options.values.includes("arbitration")) {
    statusField.options.values.push("arbitration")
  }

  function addPageField(field) {
    if (!pages.schema.getFieldByName(field.name)) {
      pages.schema.addField(new SchemaField(field))
    }
  }

  addPageField({
    name: "arbitrated_by",
    type: "relation",
    required: false,
    options: {
      collectionId: users.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: ["email"]
    }
  })
  addPageField({
    name: "arbitrated_at",
    type: "date",
    required: false,
    options: {}
  })
  addPageField({
    name: "arbitration_note",
    type: "text",
    required: false,
    options: { min: null, max: 4000, pattern: "" }
  })

  // All proofreader page mutations now go through authenticated custom routes.
  pages.updateRule = '@request.auth.role = "admin"'
  dao.saveCollection(pages)

  let attempts = null
  try {
    attempts = dao.findCollectionByNameOrId("proofreading_attempts")
  } catch {
    attempts = new Collection({
      name: "proofreading_attempts",
      type: "base",
      schema: [
        {
          name: "page",
          type: "relation",
          required: true,
          options: {
            collectionId: pages.id,
            cascadeDelete: true,
            minSelect: null,
            maxSelect: 1,
            displayFields: ["page_number"]
          }
        },
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
          name: "proofreader",
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
          name: "round",
          type: "number",
          required: true,
          options: { min: 1, max: null, noDecimal: true }
        },
        {
          name: "pass_no",
          type: "number",
          required: true,
          options: { min: 1, max: 3, noDecimal: true }
        },
        {
          name: "kind",
          type: "select",
          required: true,
          options: { maxSelect: 1, values: ["first", "second", "arbitration"] }
        },
        {
          name: "row_json",
          type: "text",
          required: true,
          options: { min: 2, max: null, pattern: "" }
        },
        {
          name: "text",
          type: "text",
          required: false,
          options: { min: null, max: null, pattern: "" }
        },
        {
          name: "outcome",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["waiting", "matched", "mismatched", "arbitrated"]
          }
        },
        {
          name: "submitted_at",
          type: "date",
          required: true,
          options: {}
        }
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_attempt_page_round_pass ON proofreading_attempts (page, round, pass_no)",
        "CREATE INDEX idx_attempt_proofreader ON proofreading_attempts (proofreader)",
        "CREATE INDEX idx_attempt_project ON proofreading_attempts (project)"
      ],
      listRule: '@request.auth.role = "admin" || proofreader = @request.auth.id',
      viewRule: '@request.auth.role = "admin" || proofreader = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null
    })
    dao.saveCollection(attempts)
  }

  const legacyPages = dao.findRecordsByFilter("pages", 'id != ""', "created", 1000000, 0)
  for (const page of legacyPages) {
    const round = page.getInt("proofread_round") || 1
    const projectId = page.getString("project")
    const firstUser = page.getString("first_proofreader")
    const secondUser = page.getString("second_proofreader")
    const firstRow = page.getString("first_proofread_row_json")
    const secondRow = page.getString("second_proofread_row_json")
    const status = page.getString("status")

    if (firstUser && firstRow) {
      const existing = dao.findRecordsByFilter(
        "proofreading_attempts",
        `page = "${page.getId()}" && round = ${round} && pass_no = 1`,
        "",
        1,
        0
      )
      if (!existing.length) {
        const first = new Record(attempts)
        first.set("page", page.getId())
        first.set("project", projectId)
        first.set("proofreader", firstUser)
        first.set("round", round)
        first.set("pass_no", 1)
        first.set("kind", "first")
        first.set("row_json", firstRow)
        first.set("text", page.getString("first_proofread_text"))
        first.set("outcome", status === "approved" ? "matched" : "waiting")
        first.set("submitted_at", page.get("first_proofread_at") || page.get("proofread_at"))
        dao.saveRecord(first)
      }
    }

    if (secondUser && secondRow) {
      const existing = dao.findRecordsByFilter(
        "proofreading_attempts",
        `page = "${page.getId()}" && round = ${round} && pass_no = 2`,
        "",
        1,
        0
      )
      if (!existing.length) {
        const second = new Record(attempts)
        second.set("page", page.getId())
        second.set("project", projectId)
        second.set("proofreader", secondUser)
        second.set("round", round)
        second.set("pass_no", 2)
        second.set("kind", "second")
        second.set("row_json", secondRow)
        second.set("text", page.getString("second_proofread_text"))
        second.set("outcome", status === "approved" ? "matched" : "mismatched")
        second.set("submitted_at", page.get("second_proofread_at") || page.get("proofread_at"))
        dao.saveRecord(second)
      }
    }

    // Sensitive pass payloads no longer live on the broadly readable task record.
    page.set("first_proofread_row_json", "")
    page.set("first_proofread_text", "")
    page.set("second_proofread_row_json", "")
    page.set("second_proofread_text", "")
    if (status !== "approved") {
      page.set("proofread_row_json", "")
      page.set("proofread_text", "")
    }
    dao.saveRecord(page)
  }
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  pages.updateRule = [
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && proofreader = @request.auth.id)',
    '|| (@request.auth.role = "proofreader" && (status = "pending" || status = "proofread") && @request.data.status = "claimed" && @request.data.proofreader = @request.auth.id)'
  ].join(" ")

  const statusField = pages.schema.getFieldByName("status")
  if (statusField) {
    statusField.options.values = statusField.options.values.filter((value) => value !== "arbitration")
  }
  for (const name of ["arbitrated_by", "arbitrated_at", "arbitration_note"]) {
    const field = pages.schema.getFieldByName(name)
    if (field) pages.schema.removeField(field.id)
  }
  dao.saveCollection(pages)

  try {
    dao.deleteCollection(dao.findCollectionByNameOrId("proofreading_attempts"))
  } catch {}
})
