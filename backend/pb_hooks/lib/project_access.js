const idPattern = /^[a-z0-9]{15}$/
const joinFailureLimit = 5
const joinFailureWindowMs = 15 * 60 * 1000
const joinBlockDurationMs = 15 * 60 * 1000

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

function projectJoinAttempt(dao, projectId, userId) {
  const records = dao.findRecordsByFilter(
    "project_join_attempts",
    `project = "${projectId}" && user = "${userId}"`,
    "",
    1,
    0
  )
  return records.length ? records[0] : null
}

function projectJoinSourceKey(source) {
  const normalized = String(source || "").trim().toLowerCase() || "unknown"
  return $security.sha256(`fangji-project-join-source-v1:${normalized}`)
}

function projectJoinSourceAttempt(dao, projectId, sourceKey) {
  const records = dao.findRecordsByFilter(
    "project_join_source_attempts",
    `project = "${projectId}" && source_key = "${sourceKey}"`,
    "",
    1,
    0
  )
  return records.length ? records[0] : null
}

function dateMillis(value) {
  if (!value || value.isZero()) return 0
  return value.time().unixMilli()
}

function projectJoinBlocked(attempt, nowMs) {
  return Boolean(attempt && dateMillis(attempt.getDateTime("blocked_until")) > nowMs)
}

function recordProjectJoinFailure(dao, projectId, userId, nowMs) {
  let attempt = projectJoinAttempt(dao, projectId, userId)
  if (!attempt) attempt = new Record(dao.findCollectionByNameOrId("project_join_attempts"))

  const windowStarted = dateMillis(attempt.getDateTime("window_started"))
  const withinWindow = windowStarted > 0 && nowMs - windowStarted < joinFailureWindowMs
  const failures = (withinWindow ? attempt.getInt("failures") : 0) + 1
  const startedAt = withinWindow ? new Date(windowStarted).toISOString() : new Date(nowMs).toISOString()
  const blockedUntil = failures >= joinFailureLimit
    ? new Date(nowMs + joinBlockDurationMs).toISOString()
    : ""

  attempt.set("project", projectId)
  attempt.set("user", userId)
  attempt.set("failures", failures)
  attempt.set("window_started", startedAt)
  attempt.set("blocked_until", blockedUntil)
  dao.saveRecord(attempt)
  return failures >= joinFailureLimit
}

function recordProjectJoinSourceFailure(dao, projectId, sourceKey, nowMs) {
  let attempt = projectJoinSourceAttempt(dao, projectId, sourceKey)
  if (!attempt) attempt = new Record(dao.findCollectionByNameOrId("project_join_source_attempts"))

  const windowStarted = dateMillis(attempt.getDateTime("window_started"))
  const withinWindow = windowStarted > 0 && nowMs - windowStarted < joinFailureWindowMs
  const failures = (withinWindow ? attempt.getInt("failures") : 0) + 1
  const startedAt = withinWindow ? new Date(windowStarted).toISOString() : new Date(nowMs).toISOString()
  const blockedUntil = failures >= joinFailureLimit
    ? new Date(nowMs + joinBlockDurationMs).toISOString()
    : ""

  attempt.set("project", projectId)
  attempt.set("source_key", sourceKey)
  attempt.set("failures", failures)
  attempt.set("window_started", startedAt)
  attempt.set("blocked_until", blockedUntil)
  dao.saveRecord(attempt)
  return failures >= joinFailureLimit
}

function clearProjectJoinAttempt(dao, projectId, userId) {
  const attempt = projectJoinAttempt(dao, projectId, userId)
  if (attempt) dao.deleteRecord(attempt)
}

function clearProjectJoinSourceAttempt(dao, projectId, sourceKey) {
  const attempt = projectJoinSourceAttempt(dao, projectId, sourceKey)
  if (attempt) dao.deleteRecord(attempt)
}

function clearProjectJoinAttempts(dao, projectId) {
  const attempts = dao.findRecordsByFilter(
    "project_join_attempts",
    `project = "${projectId}"`,
    "",
    1000000,
    0
  )
  for (const attempt of attempts) dao.deleteRecord(attempt)

  const sourceAttempts = dao.findRecordsByFilter(
    "project_join_source_attempts",
    `project = "${projectId}"`,
    "",
    1000000,
    0
  )
  for (const attempt of sourceAttempts) dao.deleteRecord(attempt)
}

function verifyProjectPassword(secret, password) {
  return Boolean(secret && secret.validatePassword(String(password || "")))
}

function utf8ByteLength(value) {
  let length = 0
  for (const character of String(value || "")) {
    const codePoint = character.codePointAt(0)
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return length
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
  if (value.length < 8 || utf8ByteLength(value) > 72) {
    throw new BadRequestError("项目口令至少需要 8 个字符，且编码后不能超过 72 字节")
  }
  let secret = projectSecret(dao, projectId)
  if (!secret) secret = new Record(dao.findCollectionByNameOrId("project_access_secrets"))
  secret.set("project", projectId)
  secret.set("username", `project_${projectId}`)
  secret.setPassword(value)
  dao.saveRecord(secret)
  clearProjectJoinAttempts(dao, projectId)
}

function deleteProjectSecret(dao, projectId) {
  const secret = projectSecret(dao, projectId)
  if (secret) dao.deleteRecord(secret)
  clearProjectJoinAttempts(dao, projectId)
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
  projectJoinAttempt,
  projectJoinSourceKey,
  projectJoinSourceAttempt,
  projectJoinBlocked,
  recordProjectJoinFailure,
  recordProjectJoinSourceFailure,
  clearProjectJoinAttempt,
  clearProjectJoinSourceAttempt,
  clearProjectJoinAttempts,
  verifyProjectPassword,
  projectAcl,
  syncProjectAcl,
  setProjectPassword,
  deleteProjectSecret
}
