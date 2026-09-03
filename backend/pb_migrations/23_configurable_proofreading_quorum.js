/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const projects = dao.findCollectionByNameOrId("projects")
  const pages = dao.findCollectionByNameOrId("pages")
  const attempts = dao.findCollectionByNameOrId("proofreading_attempts")

  projects.schema.addField(new SchemaField({
    name: "required_proofreads",
    type: "number",
    required: true,
    options: { min: 2, max: 1000, noDecimal: true }
  }))
  dao.saveCollection(projects)
  for (const project of dao.findRecordsByFilter("projects", 'id != ""', "created", 1000000, 0)) {
    project.set("required_proofreads", 2)
    dao.saveRecord(project)
  }

  pages.schema.addField(new SchemaField({
    name: "proofread_count",
    type: "number",
    required: false,
    options: { min: 0, max: 1000, noDecimal: true }
  }))
  dao.saveCollection(pages)

  const kindField = attempts.schema.getFieldByName("kind")
  kindField.options.values = ["first", "second", "proofread", "arbitration"]
  const passField = attempts.schema.getFieldByName("pass_no")
  passField.options.max = 1001
  dao.saveCollection(attempts)

  for (const attempt of dao.findRecordsByFilter(
    "proofreading_attempts",
    'kind = "first" || kind = "second"',
    "created",
    1000000,
    0
  )) {
    attempt.set("kind", "proofread")
    dao.saveRecord(attempt)
  }
  kindField.options.values = ["proofread", "arbitration"]
  attempts.indexes = [
    "CREATE UNIQUE INDEX idx_attempt_page_round_pass ON proofreading_attempts (page, round, pass_no)",
    "CREATE UNIQUE INDEX idx_attempt_page_round_user_kind ON proofreading_attempts (page, round, proofreader, kind)",
    "CREATE INDEX idx_attempt_proofreader ON proofreading_attempts (proofreader)",
    "CREATE INDEX idx_attempt_project ON proofreading_attempts (project)"
  ]
  dao.saveCollection(attempts)

  for (const page of dao.findRecordsByFilter("pages", 'id != ""', "created", 1000000, 0)) {
    const round = page.getInt("proofread_round") || 1
    const submitted = dao.findRecordsByFilter(
      "proofreading_attempts",
      `page = "${page.getId()}" && round = ${round} && kind = "proofread"`,
      "pass_no",
      1000,
      0
    )
    page.set("proofread_count", submitted.length)
    dao.saveRecord(page)
  }
}, (db) => {
  const dao = new Dao(db)
  const attempts = dao.findCollectionByNameOrId("proofreading_attempts")
  const kindField = attempts.schema.getFieldByName("kind")
  kindField.options.values = ["proofread", "arbitration", "first", "second"]
  dao.saveCollection(attempts)
  for (const attempt of dao.findRecordsByFilter(
    "proofreading_attempts",
    'kind = "proofread"',
    "pass_no",
    1000000,
    0
  )) {
    attempt.set("kind", attempt.getInt("pass_no") === 1 ? "first" : "second")
    if (attempt.getInt("pass_no") > 2) dao.deleteRecord(attempt)
    else dao.saveRecord(attempt)
  }
  for (const attempt of dao.findRecordsByFilter(
    "proofreading_attempts",
    'kind = "arbitration"',
    "created",
    1000000,
    0
  )) {
    attempt.set("pass_no", 3)
    dao.saveRecord(attempt)
  }
  kindField.options.values = ["first", "second", "arbitration"]
  const passField = attempts.schema.getFieldByName("pass_no")
  passField.options.max = 3
  attempts.indexes = [
    "CREATE UNIQUE INDEX idx_attempt_page_round_pass ON proofreading_attempts (page, round, pass_no)",
    "CREATE INDEX idx_attempt_proofreader ON proofreading_attempts (proofreader)",
    "CREATE INDEX idx_attempt_project ON proofreading_attempts (project)"
  ]
  dao.saveCollection(attempts)

  const pages = dao.findCollectionByNameOrId("pages")
  const countField = pages.schema.getFieldByName("proofread_count")
  if (countField) pages.schema.removeField(countField.id)
  dao.saveCollection(pages)

  const projects = dao.findCollectionByNameOrId("projects")
  const requiredField = projects.schema.getFieldByName("required_proofreads")
  if (requiredField) projects.schema.removeField(requiredField.id)
  dao.saveCollection(projects)
})
