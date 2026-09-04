/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/fangji/access-context", (c) => {
  const { auth: fangjiAuth, capabilities: fangjiCapabilities, isPlatformAdmin: fangjiIsPlatformAdmin, creationCapability: fangjiCreationCapability } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const dao = $app.dao()
  const managed = []
  const proofreading = []
  const projects = dao.findRecordsByFilter("projects", 'id != ""', "name", 1000000, 0)
  for (const project of projects) {
    const capabilities = fangjiCapabilities(dao, project, auth)
    if (capabilities.canManage) managed.push(project.getId())
    if (capabilities.canProofread) proofreading.push(project.getId())
  }
  return c.json(200, {
    globalRole: auth.getString("role"),
    isPlatformAdmin: fangjiIsPlatformAdmin(auth),
    managedProjectIds: managed,
    proofreadingProjectIds: proofreading,
    ...fangjiCreationCapability(dao, auth)
  })
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/projects", (c) => {
  const { auth: fangjiAuth, capabilities: fangjiCapabilities, projectJson: fangjiProjectJson } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const scope = String(c.queryParam("scope") || "all")
  if (!["all", "managed", "proofreading", "discoverable"].includes(scope)) {
    throw new BadRequestError("项目列表范围无效")
  }
  const dao = $app.dao()
  const result = []
  const projects = dao.findRecordsByFilter("projects", 'id != ""', "name", 1000000, 0)
  for (const project of projects) {
    const capabilities = fangjiCapabilities(dao, project, auth)
    const accessMode = project.getString("access_mode") || "members_only"
    const include = scope === "managed"
      ? capabilities.canManage
      : scope === "proofreading"
        ? capabilities.canProofread
        : scope === "discoverable"
          ? capabilities.isMember || capabilities.isPlatformAdmin || accessMode !== "members_only"
          : capabilities.isMember || capabilities.isPlatformAdmin || accessMode !== "members_only"
    if (include) result.push(fangjiProjectJson(dao, project, auth))
  }
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/projects/:projectId", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, project: fangjiProject, capabilities: fangjiCapabilities, projectJson: fangjiProjectJson } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const dao = $app.dao()
  const project = fangjiProject(dao, projectId)
  const capabilities = fangjiCapabilities(dao, project, auth)
  const accessMode = project.getString("access_mode") || "members_only"
  if (!capabilities.isMember && !capabilities.isPlatformAdmin && accessMode === "members_only") {
    throw new ForbiddenError("你不是该项目成员")
  }
  return c.json(200, fangjiProjectJson(dao, project, auth))
}, $apis.requireRecordAuth("users"))

routerAdd("POST", "/api/fangji/projects", (c) => {
  const { auth: fangjiAuth, creationCapability: fangjiCreationCapability, setProjectPassword: fangjiSetProjectPassword, projectJson: fangjiProjectJson, syncProjectAcl: fangjiSyncProjectAcl } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const body = new DynamicModel({ name: "", description: "", accessMode: "members_only", password: "" })
  c.bind(body)
  const name = String(body.name || "").trim()
  const description = String(body.description || "").trim()
  const accessMode = String(body.accessMode || "members_only")
  if (!name || name.length > 500) throw new BadRequestError("项目名称不能为空且不能超过 500 个字符")
  if (description.length > 2000) throw new BadRequestError("项目简介不能超过 2000 个字符")
  if (!["public", "members_only", "password"].includes(accessMode)) throw new BadRequestError("项目访问模式无效")

  let result = null
  $app.dao().runInTransaction((txDao) => {
    const capability = fangjiCreationCapability(txDao, auth)
    if (!capability.grantEnabled) throw new ForbiddenError("平台管理员尚未向你开放项目创建权限")
    if (!capability.canCreateProjects) throw new ForbiddenError("你已达到可创建项目的额度")

    const project = new Record(txDao.findCollectionByNameOrId("projects"))
    project.set("name", name)
    project.set("description", description)
    project.set("admin", auth.getId())
    project.set("access_mode", accessMode)
    txDao.saveRecord(project)
    fangjiSyncProjectAcl(txDao, project.getId())
    if (accessMode === "password") fangjiSetProjectPassword(txDao, project.getId(), body.password)
    result = fangjiProjectJson(txDao, project, auth)
  })
  return c.json(201, result)
}, $apis.requireRecordAuth("users"))

routerAdd("PATCH", "/api/fangji/projects/:projectId", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager, projectSecret: fangjiProjectSecret, deleteProjectSecret: fangjiDeleteProjectSecret, setProjectPassword: fangjiSetProjectPassword, projectJson: fangjiProjectJson } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const body = new DynamicModel({ name: "", description: "", accessMode: "", password: "" })
  c.bind(body)
  let result = null
  $app.dao().runInTransaction((txDao) => {
    const { project } = fangjiRequireManager(txDao, projectId, auth)
    const name = String(body.name || "").trim()
    const description = String(body.description || "").trim()
    const accessMode = String(body.accessMode || "").trim()
    if (name) {
      if (name.length > 500) throw new BadRequestError("项目名称不能超过 500 个字符")
      project.set("name", name)
    }
    if (body.description !== undefined) {
      if (description.length > 2000) throw new BadRequestError("项目简介不能超过 2000 个字符")
      project.set("description", description)
    }
    if (accessMode) {
      if (!["public", "members_only", "password"].includes(accessMode)) throw new BadRequestError("项目访问模式无效")
      if (accessMode === "password" && !fangjiProjectSecret(txDao, projectId) && !String(body.password || "")) {
        throw new BadRequestError("切换为口令加入时必须设置项目口令")
      }
      project.set("access_mode", accessMode)
      if (accessMode !== "password") fangjiDeleteProjectSecret(txDao, projectId)
    }
    if (String(body.password || "")) {
      if ((accessMode || project.getString("access_mode")) !== "password") {
        throw new BadRequestError("只有口令加入项目可以设置口令")
      }
      fangjiSetProjectPassword(txDao, projectId, body.password)
    }
    txDao.saveRecord(project)
    result = fangjiProjectJson(txDao, project, auth)
  })
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("DELETE", "/api/fangji/projects/:projectId", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireOwner: fangjiRequireOwner } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  $app.dao().runInTransaction((txDao) => {
    const { project } = fangjiRequireOwner(txDao, projectId, auth)
    txDao.deleteRecord(project)
  })
  return c.noContent(204)
}, $apis.requireRecordAuth("users"))

routerAdd("PUT", "/api/fangji/projects/:projectId/owner", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireOwner: fangjiRequireOwner, membership: fangjiMembership, projectJson: fangjiProjectJson, syncProjectAcl: fangjiSyncProjectAcl } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const body = new DynamicModel({ userId: "" })
  c.bind(body)
  const nextOwnerId = fangjiAssertId(body.userId, "用户")
  let result = null
  $app.dao().runInTransaction((txDao) => {
    const { project } = fangjiRequireOwner(txDao, projectId, auth)
    try { txDao.findRecordById("users", nextOwnerId) } catch { throw new NotFoundError("新所有者不存在") }
    const previousOwnerId = project.getString("admin")
    if (previousOwnerId === nextOwnerId) {
      result = fangjiProjectJson(txDao, project, auth)
      return
    }
    const targetMembership = fangjiMembership(txDao, projectId, nextOwnerId)
    if (targetMembership) txDao.deleteRecord(targetMembership)
    project.set("admin", nextOwnerId)
    txDao.saveRecord(project)

    if (previousOwnerId) {
      let previousMembership = fangjiMembership(txDao, projectId, previousOwnerId)
      if (!previousMembership) previousMembership = new Record(txDao.findCollectionByNameOrId("project_memberships"))
      previousMembership.set("project", projectId)
      previousMembership.set("user", previousOwnerId)
      previousMembership.set("role", "manager")
      previousMembership.set("source", "assigned")
      previousMembership.set("created_by", auth.getId())
      txDao.saveRecord(previousMembership)
    }
    fangjiSyncProjectAcl(txDao, projectId)
    result = fangjiProjectJson(txDao, project, auth)
  })
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("POST", "/api/fangji/projects/:projectId/join", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, project: fangjiProject, membership: fangjiMembership, projectSecret: fangjiProjectSecret, projectJoinAttempt: fangjiProjectJoinAttempt, projectJoinSourceKey: fangjiProjectJoinSourceKey, projectJoinSourceAttempt: fangjiProjectJoinSourceAttempt, projectJoinBlocked: fangjiProjectJoinBlocked, recordProjectJoinFailure: fangjiRecordProjectJoinFailure, recordProjectJoinSourceFailure: fangjiRecordProjectJoinSourceFailure, clearProjectJoinAttempt: fangjiClearProjectJoinAttempt, clearProjectJoinSourceAttempt: fangjiClearProjectJoinSourceAttempt, verifyProjectPassword: fangjiVerifyProjectPassword, projectJson: fangjiProjectJson, syncProjectAcl: fangjiSyncProjectAcl } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const sourceKey = fangjiProjectJoinSourceKey(c.realIP())
  const body = new DynamicModel({ password: "" })
  c.bind(body)
  let result = null
  let denial = null
  $app.dao().runInTransaction((txDao) => {
    const project = fangjiProject(txDao, projectId)
    if (project.getString("admin") === auth.getId()) {
      result = fangjiProjectJson(txDao, project, auth)
      return
    }
    const existing = fangjiMembership(txDao, projectId, auth.getId())
    if (existing) {
      result = fangjiProjectJson(txDao, project, auth)
      return
    }
    const accessMode = project.getString("access_mode") || "members_only"
    if (accessMode === "members_only") {
      denial = { status: 403, message: "该项目只能由管理员指定成员" }
      return
    }
    if (accessMode === "password") {
      const nowMs = Date.now()
      const attempt = fangjiProjectJoinAttempt(txDao, projectId, auth.getId())
      const sourceAttempt = fangjiProjectJoinSourceAttempt(txDao, projectId, sourceKey)
      if (fangjiProjectJoinBlocked(attempt, nowMs) || fangjiProjectJoinBlocked(sourceAttempt, nowMs)) {
        denial = { status: 429, message: "项目口令尝试过于频繁，请稍后再试" }
        return
      }
      const secret = fangjiProjectSecret(txDao, projectId)
      const password = String(body.password || "")
      if (!fangjiVerifyProjectPassword(secret, password)) {
        const userBlocked = fangjiRecordProjectJoinFailure(txDao, projectId, auth.getId(), nowMs)
        const sourceBlocked = fangjiRecordProjectJoinSourceFailure(txDao, projectId, sourceKey, nowMs)
        denial = userBlocked || sourceBlocked
          ? { status: 429, message: "项目口令尝试过于频繁，请稍后再试" }
          : { status: 403, message: "项目口令不正确" }
        return
      }
      fangjiClearProjectJoinAttempt(txDao, projectId, auth.getId())
      fangjiClearProjectJoinSourceAttempt(txDao, projectId, sourceKey)
    }
    const membership = new Record(txDao.findCollectionByNameOrId("project_memberships"))
    membership.set("project", projectId)
    membership.set("user", auth.getId())
    membership.set("role", "proofreader")
    membership.set("source", accessMode)
    membership.set("created_by", auth.getId())
    txDao.saveRecord(membership)
    fangjiSyncProjectAcl(txDao, projectId)
    result = fangjiProjectJson(txDao, project, auth)
  })
  if (denial) throw new ApiError(denial.status, denial.message)
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/projects/:projectId/members", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const dao = $app.dao()
  const { project } = fangjiRequireManager(dao, projectId, auth)
  const result = []
  const owner = dao.findRecordById("users", project.getString("admin"))
  result.push({
    id: `owner:${owner.getId()}`,
    user: owner.getId(),
    name: owner.getString("name"),
    username: owner.getString("username"),
    email: owner.getString("email"),
    role: "owner",
    source: "assigned"
  })
  const memberships = dao.findRecordsByFilter("project_memberships", `project = "${projectId}"`, "created", 1000000, 0)
  for (const membership of memberships) {
    let user = null
    try { user = dao.findRecordById("users", membership.getString("user")) } catch { continue }
    result.push({
      id: membership.getId(),
      user: user.getId(),
      name: user.getString("name"),
      username: user.getString("username"),
      email: user.getString("email"),
      role: membership.getString("role"),
      source: membership.getString("source")
    })
  }
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/projects/:projectId/member-candidates", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const dao = $app.dao()
  fangjiRequireManager(dao, projectId, auth)
  const result = []
  for (const user of dao.findRecordsByFilter("users", 'id != ""', "name,email", 1000000, 0)) {
    result.push({
      id: user.getId(),
      name: user.getString("name"),
      username: user.getString("username"),
      email: user.getString("email")
    })
  }
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("PUT", "/api/fangji/projects/:projectId/members/:userId", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager, membership: fangjiMembership, syncProjectAcl: fangjiSyncProjectAcl } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const userId = fangjiAssertId(c.pathParam("userId"), "用户")
  const body = new DynamicModel({ role: "proofreader" })
  c.bind(body)
  const role = String(body.role || "proofreader")
  if (!["manager", "proofreader"].includes(role)) throw new BadRequestError("项目角色无效")
  let result = null
  $app.dao().runInTransaction((txDao) => {
    const { project } = fangjiRequireManager(txDao, projectId, auth)
    if (project.getString("admin") === userId) throw new BadRequestError("项目所有者不能重复添加为成员")
    try { txDao.findRecordById("users", userId) } catch { throw new NotFoundError("用户不存在") }
    let membership = fangjiMembership(txDao, projectId, userId)
    if (!membership) membership = new Record(txDao.findCollectionByNameOrId("project_memberships"))
    membership.set("project", projectId)
    membership.set("user", userId)
    membership.set("role", role)
    membership.set("source", "assigned")
    membership.set("created_by", auth.getId())
    txDao.saveRecord(membership)
    fangjiSyncProjectAcl(txDao, projectId)
    result = { id: membership.getId(), project: projectId, user: userId, role, source: "assigned" }
  })
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("DELETE", "/api/fangji/projects/:projectId/members/:userId", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager, membership: fangjiMembership, syncProjectAcl: fangjiSyncProjectAcl } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const userId = fangjiAssertId(c.pathParam("userId"), "用户")
  $app.dao().runInTransaction((txDao) => {
    const { project } = fangjiRequireManager(txDao, projectId, auth)
    if (project.getString("admin") === userId) throw new BadRequestError("不能移除项目所有者")
    const membership = fangjiMembership(txDao, projectId, userId)
    if (membership) txDao.deleteRecord(membership)
    fangjiSyncProjectAcl(txDao, projectId)
  })
  return c.noContent(204)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/platform/creator-grants", (c) => {
  const { auth: fangjiAuth, isPlatformAdmin: fangjiIsPlatformAdmin, creatorGrant: fangjiCreatorGrant, nullableLimit: fangjiNullableLimit, ownedProjectCount: fangjiOwnedProjectCount } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  if (!fangjiIsPlatformAdmin(auth)) throw new ForbiddenError("只有平台管理员可以管理项目创建权限")
  const dao = $app.dao()
  const result = []
  for (const user of dao.findRecordsByFilter("users", 'id != ""', "name,email", 1000000, 0)) {
    const grant = fangjiCreatorGrant(dao, user.getId())
    result.push({
      user: user.getId(),
      name: user.getString("name"),
      username: user.getString("username"),
      email: user.getString("email"),
      globalRole: user.getString("role"),
      enabled: fangjiIsPlatformAdmin(user) || Boolean(grant && grant.getBool("enabled")),
      projectLimit: fangjiIsPlatformAdmin(user) ? null : fangjiNullableLimit(grant),
      ownedProjectCount: fangjiOwnedProjectCount(dao, user.getId()),
      grantedAt: grant ? String(grant.get("granted_at") || "") : "",
      revokedAt: grant ? String(grant.get("revoked_at") || "") : ""
    })
  }
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))

routerAdd("PUT", "/api/fangji/platform/creator-grants/:userId", (c) => {
  const { auth: fangjiAuth, isPlatformAdmin: fangjiIsPlatformAdmin, assertId: fangjiAssertId, creatorGrant: fangjiCreatorGrant, ownedProjectCount: fangjiOwnedProjectCount } = require(`${__hooks}/lib/project_access.js`)
  const auth = fangjiAuth(c)
  if (!fangjiIsPlatformAdmin(auth)) throw new ForbiddenError("只有平台管理员可以管理项目创建权限")
  const userId = fangjiAssertId(c.pathParam("userId"), "用户")
  const body = new DynamicModel({ enabled: false, projectLimit: 0 })
  c.bind(body)
  const enabled = Boolean(body.enabled)
  const rawLimit = body.projectLimit
  const limit = rawLimit === null || rawLimit === undefined || rawLimit === "" || Number(rawLimit) === 0
    ? null
    : Number(rawLimit)
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100000)) {
    throw new BadRequestError("项目额度必须为 1 到 100000 的整数，留空表示不限量")
  }
  let result = null
  $app.dao().runInTransaction((txDao) => {
    let user = null
    try { user = txDao.findRecordById("users", userId) } catch { throw new NotFoundError("用户不存在") }
    if (fangjiIsPlatformAdmin(user)) throw new BadRequestError("平台管理员的创建权限始终有效且不限量")
    let grant = fangjiCreatorGrant(txDao, userId)
    if (!grant) grant = new Record(txDao.findCollectionByNameOrId("project_creator_grants"))
    grant.set("user", userId)
    grant.set("enabled", enabled)
    grant.set("project_limit", limit)
    grant.set("granted_by", auth.getId())
    grant.set("granted_at", new Date().toISOString())
    grant.set("revoked_at", enabled ? "" : new Date().toISOString())
    txDao.saveRecord(grant)
    result = {
      user: userId,
      enabled,
      projectLimit: limit,
      ownedProjectCount: fangjiOwnedProjectCount(txDao, userId)
    }
  })
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))
