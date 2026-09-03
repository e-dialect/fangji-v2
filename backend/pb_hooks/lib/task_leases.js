const leaseDurationMs = 10 * 60 * 1000

function leaseForPage(dao, pageId) {
  const records = dao.findRecordsByFilter("task_leases", `page = "${pageId}"`, "", 1, 0)
  return records.length ? records[0] : null
}

function queueStatusForPage(page, lease) {
  const saved = lease?.getString("queue_status")
  if (saved === "pending" || saved === "proofread") return saved
  return page.getInt("proofread_count") > 0 ? "proofread" : "pending"
}

function leaseExpired(lease, nowMs = Date.now()) {
  if (!lease) return true
  const expiresAt = lease.getDateTime("expires_at").time().unixMilli()
  return !Number.isFinite(expiresAt) || expiresAt <= nowMs
}

function hashLeaseToken(token) {
  return $security.sha256(String(token || ""))
}

function issueLease(dao, page, userId, queueStatus) {
  let lease = leaseForPage(dao, page.getId())
  if (!lease) lease = new Record(dao.findCollectionByNameOrId("task_leases"))
  const token = $security.randomString(64)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString()
  lease.set("page", page.getId())
  lease.set("project", page.getString("project"))
  lease.set("holder", userId)
  lease.set("token_hash", hashLeaseToken(token))
  lease.set("expires_at", expiresAt)
  lease.set("last_activity_at", now.toISOString())
  lease.set("queue_status", queueStatus === "proofread" ? "proofread" : "pending")
  dao.saveRecord(lease)
  page.set("lease_expires_at", expiresAt)
  return { lease, token, expiresAt }
}

function requireLease(dao, page, userId, token) {
  const value = String(token || "")
  if (value.length < 32 || value.length > 200) throw new BadRequestError("任务租约已失效，请重新领取")
  const lease = leaseForPage(dao, page.getId())
  const actualHash = hashLeaseToken(value)
  if (!lease || lease.getString("holder") !== userId || !$security.equal(lease.getString("token_hash"), actualHash)) {
    throw new BadRequestError("任务已被重新领取，本地草稿仍保留，请重新领取任务")
  }
  return lease
}

function renewLease(dao, page, userId, token) {
  const lease = requireLease(dao, page, userId, token)
  if (!["claimed", "proofreading"].includes(page.getString("status")) || page.getString("proofreader") !== userId) {
    throw new BadRequestError("任务当前不属于你，请重新领取")
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString()
  lease.set("expires_at", expiresAt)
  lease.set("last_activity_at", now.toISOString())
  dao.saveRecord(lease)
  page.set("lease_expires_at", expiresAt)
  dao.saveRecord(page)
  return expiresAt
}

function clearLease(dao, page) {
  const lease = leaseForPage(dao, page.getId())
  if (lease) dao.deleteRecord(lease)
  page.set("lease_expires_at", null)
}

function releaseLease(dao, page, userId, token) {
  const lease = requireLease(dao, page, userId, token)
  if (!["claimed", "proofreading"].includes(page.getString("status")) || page.getString("proofreader") !== userId) {
    throw new BadRequestError("任务当前不属于你，请重新领取")
  }
  page.set("status", queueStatusForPage(page, lease))
  page.set("proofreader", null)
  clearLease(dao, page)
  dao.saveRecord(page)
}

module.exports = {
  leaseDurationMs,
  leaseForPage,
  queueStatusForPage,
  leaseExpired,
  issueLease,
  requireLease,
  renewLease,
  clearLease,
  releaseLease
}
