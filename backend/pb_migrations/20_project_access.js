/// <reference path="../pb_data/types.d.ts" />

// Project-scoped authorization and project creation grants.
//
// `projects.admin` remains the storage field for the unique owner so existing
// data and file imports keep working. The application exposes it as `owner`.
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId("users")
  const projects = dao.findCollectionByNameOrId("projects")

  // Expand before migrating records so both legacy and new values validate.
  const roleField = users.schema.getFieldByName("role")
  roleField.options.values = ["admin", "proofreader", "platform_admin", "user"]
  dao.saveCollection(users)

  const legacyProofreaders = dao.findRecordsByFilter(
    "users",
    'role = "proofreader"',
    "created",
    1000000,
    0
  )
  const legacyAdmins = dao.findRecordsByFilter(
    "users",
    'role = "admin"',
    "created",
    1000000,
    0
  )

  for (const user of legacyAdmins) {
    user.set("role", "platform_admin")
    dao.saveRecord(user)
  }
  for (const user of legacyProofreaders) {
    user.set("role", "user")
    dao.saveRecord(user)
  }

  roleField.options.values = ["platform_admin", "user"]
  dao.saveCollection(users)

  if (!projects.schema.getFieldByName("access_mode")) {
    projects.schema.addField(new SchemaField({
      name: "access_mode",
      type: "select",
      required: true,
      options: {
        maxSelect: 1,
        values: ["public", "members_only", "password"]
      }
    }))
  }
  dao.saveCollection(projects)

  const existingProjects = dao.findRecordsByFilter("projects", 'id != ""', "created", 1000000, 0)
  for (const project of existingProjects) {
    if (!project.getString("access_mode")) {
      project.set("access_mode", "members_only")
      dao.saveRecord(project)
    }
  }

  const memberships = new Collection({
    name: "project_memberships",
    type: "base",
    schema: [
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
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      {
        name: "role",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["manager", "proofreader"] }
      },
      {
        name: "source",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["assigned", "public", "password"] }
      },
      {
        name: "created_by",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_project_membership_user ON project_memberships (project, user)",
      "CREATE INDEX idx_project_membership_role ON project_memberships (project, role)",
      "CREATE INDEX idx_project_membership_user_role ON project_memberships (user, role)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(memberships)

  const grants = new Collection({
    name: "project_creator_grants",
    type: "base",
    schema: [
      {
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      { name: "enabled", type: "bool", required: false, options: {} },
      { name: "project_limit", type: "number", required: false, options: { min: 1, max: 100000, noDecimal: true } },
      {
        name: "granted_by",
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
      { name: "granted_at", type: "date", required: true, options: {} },
      { name: "revoked_at", type: "date", required: false, options: {} }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_creator_grant_user ON project_creator_grants (user)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(grants)

  const secrets = new Collection({
    name: "project_access_secrets",
    type: "auth",
    schema: [
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
      }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_access_secret_project ON project_access_secrets (project)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    options: {
      allowEmailAuth: false,
      allowOAuth2Auth: false,
      allowUsernameAuth: false,
      minPasswordLength: 8,
      onlyVerified: false,
      requireEmail: false
    }
  })
  dao.saveCollection(secrets)

  const joinAttempts = new Collection({
    name: "project_join_attempts",
    type: "base",
    schema: [
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
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: ["email"]
        }
      },
      { name: "failures", type: "number", required: true, options: { min: 0, max: 100000, noDecimal: true } },
      { name: "window_started", type: "date", required: true, options: {} },
      { name: "blocked_until", type: "date", required: false, options: {} }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_join_attempt_user ON project_join_attempts (project, user)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(joinAttempts)

  const joinSourceAttempts = new Collection({
    name: "project_join_source_attempts",
    type: "base",
    schema: [
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
        name: "source_key",
        type: "text",
        required: true,
        options: { min: 64, max: 64, pattern: "^[a-f0-9]{64}$" }
      },
      { name: "failures", type: "number", required: true, options: { min: 0, max: 100000, noDecimal: true } },
      { name: "window_started", type: "date", required: true, options: {} },
      { name: "blocked_until", type: "date", required: false, options: {} }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_join_attempt_source ON project_join_source_attempts (project, source_key)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(joinSourceAttempts)

  // Legacy proofreaders previously had global access. Persist that access as
  // explicit project membership before the collection rules are tightened.
  for (const project of existingProjects) {
    const ownerId = project.getString("admin")
    for (const user of legacyProofreaders) {
      if (user.getId() === ownerId) continue
      const membership = new Record(memberships)
      membership.set("project", project.getId())
      membership.set("user", user.getId())
      membership.set("role", "proofreader")
      membership.set("source", "assigned")
      membership.set("created_by", ownerId || legacyAdmins[0]?.getId() || user.getId())
      dao.saveRecord(membership)
    }
  }

  // PocketBase 0.21 rules cannot traverse back-relations. Keep a private ACL
  // index derived from project_memberships so native file/page list rules can
  // still enforce tenant isolation without exposing the membership table.
  const projectAcls = new Collection({
    name: "project_acls",
    type: "base",
    schema: [
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
        name: "members",
        type: "relation",
        required: false,
        options: { collectionId: users.id, cascadeDelete: false, minSelect: null, maxSelect: null, displayFields: ["email"] }
      },
      {
        name: "managers",
        type: "relation",
        required: false,
        options: { collectionId: users.id, cascadeDelete: false, minSelect: null, maxSelect: null, displayFields: ["email"] }
      },
      {
        name: "proofreaders",
        type: "relation",
        required: false,
        options: { collectionId: users.id, cascadeDelete: false, minSelect: null, maxSelect: null, displayFields: ["email"] }
      }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_acl_project ON project_acls (project)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  })
  dao.saveCollection(projectAcls)

  projects.schema.addField(new SchemaField({
    name: "acl",
    type: "relation",
    required: false,
    options: {
      collectionId: projectAcls.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: []
    }
  }))
  dao.saveCollection(projects)

  for (const project of existingProjects) {
    const managerIds = []
    const proofreaderIds = []
    const projectMemberships = dao.findRecordsByFilter(
      "project_memberships",
      `project = "${project.getId()}"`,
      "created",
      1000000,
      0
    )
    for (const membership of projectMemberships) {
      const userId = membership.getString("user")
      if (membership.getString("role") === "manager") managerIds.push(userId)
      if (membership.getString("role") === "proofreader") proofreaderIds.push(userId)
    }
    const acl = new Record(projectAcls)
    acl.set("project", project.getId())
    acl.set("members", [project.getString("admin"), ...managerIds, ...proofreaderIds].filter(Boolean))
    acl.set("managers", managerIds)
    acl.set("proofreaders", proofreaderIds)
    dao.saveRecord(acl)
    project.set("acl", acl.getId())
    dao.saveRecord(project)
  }

  const projectReadRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "platform_admin"',
    '|| admin = @request.auth.id',
    '|| acl.members.id ?= @request.auth.id',
    '|| access_mode = "public"',
    '|| access_mode = "password"',
    ')'
  ].join(" ")
  const projectChildReadRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "platform_admin"',
    '|| project.admin = @request.auth.id',
    '|| project.acl.members.id ?= @request.auth.id',
    ')'
  ].join(" ")

  users.listRule = '@request.auth.role = "platform_admin"'
  users.viewRule = '@request.auth.id = id || @request.auth.role = "platform_admin"'
  users.createRule = ""
  users.updateRule = '@request.auth.id = id || @request.auth.role = "platform_admin"'
  users.deleteRule = '@request.auth.role = "platform_admin"'
  dao.saveCollection(users)

  projects.listRule = projectReadRule
  projects.viewRule = projectReadRule
  projects.createRule = null
  projects.updateRule = null
  projects.deleteRule = null
  dao.saveCollection(projects)

  const projectFiles = dao.findCollectionByNameOrId("project_files")
  projectFiles.listRule = projectChildReadRule
  projectFiles.viewRule = projectChildReadRule
  projectFiles.createRule = null
  projectFiles.updateRule = null
  projectFiles.deleteRule = null
  dao.saveCollection(projectFiles)

  const pages = dao.findCollectionByNameOrId("pages")
  pages.listRule = `${projectChildReadRule} && status != "importing"`
  pages.viewRule = `${projectChildReadRule} && status != "importing"`
  pages.createRule = '@request.auth.role = "platform_admin"'
  pages.updateRule = null
  pages.deleteRule = null
  dao.saveCollection(pages)

  const attempts = dao.findCollectionByNameOrId("proofreading_attempts")
  attempts.listRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "platform_admin"',
    '|| proofreader = @request.auth.id',
    '|| project.admin = @request.auth.id',
    ')'
  ].join(" ")
  attempts.viewRule = attempts.listRule
  attempts.createRule = null
  attempts.updateRule = null
  attempts.deleteRule = null
  dao.saveCollection(attempts)

  const importJobs = dao.findCollectionByNameOrId("import_jobs")
  importJobs.listRule = projectChildReadRule
  importJobs.viewRule = projectChildReadRule
  importJobs.createRule = null
  importJobs.updateRule = null
  importJobs.deleteRule = null
  dao.saveCollection(importJobs)

  const importErrors = dao.findCollectionByNameOrId("import_job_errors")
  const jobProjectReadRule = projectChildReadRule.split("project.").join("job.project.")
  importErrors.listRule = jobProjectReadRule
  importErrors.viewRule = jobProjectReadRule
  importErrors.createRule = null
  importErrors.updateRule = null
  importErrors.deleteRule = null
  dao.saveCollection(importErrors)
}, (db) => {
  const dao = new Dao(db)

  const projectFiles = dao.findCollectionByNameOrId("project_files")
  projectFiles.listRule = '@request.auth.id != ""'
  projectFiles.viewRule = '@request.auth.id != ""'
  projectFiles.createRule = '@request.auth.role = "admin"'
  projectFiles.updateRule = '@request.auth.role = "admin"'
  projectFiles.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(projectFiles)

  const pages = dao.findCollectionByNameOrId("pages")
  const legacyPageReadRule = [
    '@request.auth.id != "" && (',
    '@request.auth.role = "admin"',
    '|| (@request.auth.role = "proofreader" && status != "importing")',
    ')'
  ].join(" ")
  pages.listRule = legacyPageReadRule
  pages.viewRule = legacyPageReadRule
  pages.createRule = '@request.auth.role = "admin"'
  pages.updateRule = '@request.auth.role = "admin"'
  pages.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(pages)

  const attempts = dao.findCollectionByNameOrId("proofreading_attempts")
  attempts.listRule = '@request.auth.role = "admin" || proofreader = @request.auth.id'
  attempts.viewRule = attempts.listRule
  attempts.createRule = null
  attempts.updateRule = null
  attempts.deleteRule = null
  dao.saveCollection(attempts)

  const importJobs = dao.findCollectionByNameOrId("import_jobs")
  importJobs.listRule = '@request.auth.role = "admin"'
  importJobs.viewRule = '@request.auth.role = "admin"'
  importJobs.createRule = null
  importJobs.updateRule = null
  importJobs.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(importJobs)

  const importErrors = dao.findCollectionByNameOrId("import_job_errors")
  importErrors.listRule = '@request.auth.role = "admin"'
  importErrors.viewRule = '@request.auth.role = "admin"'
  importErrors.createRule = null
  importErrors.updateRule = null
  importErrors.deleteRule = null
  dao.saveCollection(importErrors)

  const projects = dao.findCollectionByNameOrId("projects")
  const aclField = projects.schema.getFieldByName("acl")
  if (aclField) {
    projects.schema.removeField(aclField.id)
    dao.saveCollection(projects)
  }

  for (const name of ["project_join_source_attempts", "project_join_attempts", "project_access_secrets", "project_creator_grants", "project_memberships", "project_acls"]) {
    try { dao.deleteCollection(dao.findCollectionByNameOrId(name)) } catch {}
  }

  const users = dao.findCollectionByNameOrId("users")
  const roleField = users.schema.getFieldByName("role")
  roleField.options.values = ["platform_admin", "user", "admin", "proofreader"]
  dao.saveCollection(users)
  for (const user of dao.findRecordsByFilter("users", 'role = "platform_admin"', "created", 1000000, 0)) {
    user.set("role", "admin")
    dao.saveRecord(user)
  }
  for (const user of dao.findRecordsByFilter("users", 'role = "user"', "created", 1000000, 0)) {
    user.set("role", "proofreader")
    dao.saveRecord(user)
  }
  roleField.options.values = ["admin", "proofreader"]
  users.listRule = '@request.auth.id != "" && @request.auth.role = "admin"'
  users.viewRule = '@request.auth.id != "" && (@request.auth.id = id || @request.auth.role = "admin")'
  users.createRule = ""
  users.updateRule = '@request.auth.id = id'
  users.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(users)

  const accessMode = projects.schema.getFieldByName("access_mode")
  if (accessMode) projects.schema.removeField(accessMode.id)
  projects.listRule = '@request.auth.id != ""'
  projects.viewRule = '@request.auth.id != ""'
  projects.createRule = '@request.auth.role = "admin"'
  projects.updateRule = '@request.auth.role = "admin"'
  projects.deleteRule = '@request.auth.role = "admin"'
  dao.saveCollection(projects)
})
