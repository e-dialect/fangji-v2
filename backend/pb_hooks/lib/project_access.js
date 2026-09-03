const idPattern = /^[a-z0-9]{15}$/

function auth(c) {
  const record = c.get("authRecord")
  if (!record) throw new UnauthorizedError("登录状态已失效，请重新登录")
  return record
}

function assertId(value, label) {
  const id = String(value || "")
  if (!idPattern.test(id)) throw new BadRequestError(`${label || "记录"}ID无效`)
  return id
}

function isPlatformAdmin(record) {
  return record && record.getString("role") === "platform_admin"
}

function membership(dao, projectId, userId) {
  const records = dao.findRecordsByFilter(
    "project_memberships",
    `project = "${projectId}" && user = "${userId}"`,
    "",
    1,
    0
  )
  return records.length ? records[0] : null
}

function project(dao, projectId) {
  try {
    return dao.findRecordById("projects", projectId)
  } catch {
    throw new NotFoundError("项目不存在或已被删除")
  }
}

function capabilities(dao, projectRecord, authRecord) {
  const platformAdmin = isPlatformAdmin(authRecord)
  const owner = projectRecord.getString("admin") === authRecord.getId()
  const member = owner ? null : membership(dao, projectRecord.getId(), authRecord.getId())
  const projectRole = owner ? "owner" : (member ? member.getString("role") : null)
  return {
    projectRole,
    isOwner: owner,
    isManager: projectRole === "manager",
    isProofreader: projectRole === "proofreader",
    canManage: platformAdmin || owner || projectRole === "manager",
    canProofread: projectRole === "proofreader",
    isMember: owner || Boolean(member),
    isPlatformAdmin: platformAdmin
  }
}

function requireManager(dao, projectId, authRecord) {
  const projectRecord = project(dao, projectId)
  const permissions = capabilities(dao, projectRecord, authRecord)
  if (!permissions.canManage) throw new ForbiddenError("你没有管理该项目的权限")
  return { project: projectRecord, capabilities: permissions }
}

function canManage(dao, projectRecord, authRecord) {
  return capabilities(dao, projectRecord, authRecord).canManage
}

function canProofread(dao, projectId, authRecord) {
  const member = membership(dao, projectId, authRecord.getId())
  return Boolean(member && member.getString("role") === "proofreader")
}

function requireOwner(dao, projectId, authRecord) {
  const projectRecord = project(dao, projectId)
  const permissions = capabilities(dao, projectRecord, authRecord)
  if (!permissions.isPlatformAdmin && !permissions.isOwner) {
    throw new ForbiddenError("只有项目所有者可以执行此操作")
  }
  return { project: projectRecord, capabilities: permissions }
}

function nullableLimit(record) {
  if (!record) return null
  const value = record.get("project_limit")
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

function creatorGrant(dao, userId) {
  const records = dao.findRecordsByFilter(
    "project_creator_grants",
    `user = "${userId}"`,
    "",
    1,
    0
  )
  return records.length ? records[0] : null
}

function ownedProjectCount(dao, userId) {
  return dao.findRecordsByFilter("projects", `admin = "${userId}"`, "", 1000000, 0).length
}

function creationCapability(dao, authRecord) {
  const ownedCount = ownedProjectCount(dao, authRecord.getId())
  if (isPlatformAdmin(authRecord)) {
    return {
      canCreateProjects: true,
      projectLimit: null,
      ownedProjectCount: ownedCount,
      remainingProjects: null,
      grantEnabled: true
    }
  }

  const grant = creatorGrant(dao, authRecord.getId())
  const enabled = Boolean(grant && grant.getBool("enabled"))
  const limit = nullableLimit(grant)
  const remaining = limit === null ? null : Math.max(limit - ownedCount, 0)
  return {
    canCreateProjects: enabled && (remaining === null || remaining > 0),
    projectLimit: limit,
    ownedProjectCount: ownedCount,
    remainingProjects: enabled ? remaining : 0,
    grantEnabled: enabled
  }
}

function projectJson(dao, projectRecord, authRecord) {
  return {
    id: projectRecord.getId(),
    name: projectRecord.getString("name"),
    description: projectRecord.getString("description"),
    owner: projectRecord.getString("admin"),
    admin: projectRecord.getString("admin"),
    access_mode: projectRecord.getString("access_mode") || "members_only",
    created: String(projectRecord.get("created") || ""),
    updated: String(projectRecord.get("updated") || ""),
    capabilities: capabilities(dao, projectRecord, authRecord)
  }
}

function projectSecret(dao, projectId) {
  const records = dao.findRecordsByFilter(
    "project_access_secrets",
    `project = "${projectId}"`,
    "",
    1,
    0
  )
  return records.length ? records[0] : null
}

function projectAcl(dao, projectId) {
  const records = dao.findRecordsByFilter("project_acls", `project = "${projectId}"`, "", 1, 0)
  return records.length ? records[0] : null
}

function syncProjectAcl(dao, projectId) {
  const projectRecord = project(dao, projectId)
  const memberships = dao.findRecordsByFilter(
    "project_memberships",
    `project = "${projectId}"`,
    "created",
    1000000,
    0
  )
  const managerIds = []
  const proofreaderIds = []
  for (const member of memberships) {
    const userId = member.getString("user")
    if (member.getString("role") === "manager") managerIds.push(userId)
    if (member.getString("role") === "proofreader") proofreaderIds.push(userId)
  }
  let acl = projectAcl(dao, projectId)
  if (!acl) acl = new Record(dao.findCollectionByNameOrId("project_acls"))
  acl.set("project", projectId)
  acl.set("members", [projectRecord.getString("admin"), ...managerIds, ...proofreaderIds].filter(Boolean))
  acl.set("managers", managerIds)
  acl.set("proofreaders", proofreaderIds)
  dao.saveRecord(acl)
  if (projectRecord.getString("acl") !== acl.getId()) {
    projectRecord.set("acl", acl.getId())
    dao.saveRecord(projectRecord)
  }
  return acl
}

function setProjectPassword(dao, projectId, password) {
  const value = String(password || "")
  if (value.length < 8 || value.length > 200) {
    throw new BadRequestError("项目口令必须为 8 到 200 个字符")
  }
  let secret = projectSecret(dao, projectId)
  if (!secret) secret = new Record(dao.findCollectionByNameOrId("project_access_secrets"))
  const salt = $security.randomString(48)
  secret.set("project", projectId)
  secret.set("salt", salt)
  secret.set("password_hash", $security.sha256(`${salt}\0${value}`))
  dao.saveRecord(secret)
}

function deleteProjectSecret(dao, projectId) {
  const secret = projectSecret(dao, projectId)
  if (secret) dao.deleteRecord(secret)
}

module.exports = {
  auth,
  assertId,
  isPlatformAdmin,
  membership,
  project,
  capabilities,
  requireManager,
  requireOwner,
  canManage,
  canProofread,
  nullableLimit,
  creatorGrant,
  ownedProjectCount,
  creationCapability,
  projectJson,
  projectSecret,
  projectAcl,
  syncProjectAcl,
  setProjectPassword,
  deleteProjectSecret
}
