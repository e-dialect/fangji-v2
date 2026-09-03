/// <reference path="../pb_data/types.d.ts" />

const FANGJI_API = "/api/fangji"

// Claiming is serialized in a database transaction. An existing active task in
// the same project always wins; otherwise the first eligible queue item is used.
routerAdd("POST", `${FANGJI_API}/projects/:projectId/claim`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "proofreader") {
    throw new ForbiddenError("无权执行此操作")
  }
  const summarize = (page) => ({
    id: page.getId(),
    project: page.getString("project"),
    project_file: page.getString("project_file"),
    page_number: page.getInt("page_number"),
    pdf_page: page.getInt("pdf_page"),
    status: page.getString("status"),
    proofreader: page.getString("proofreader"),
    first_proofreader: page.getString("first_proofreader"),
    second_proofreader: page.getString("second_proofreader"),
    proofread_round: page.getInt("proofread_round") || 1,
    mismatch_count: page.getInt("mismatch_count") || 0
  })
  const userId = auth.getId()
  const projectId = c.pathParam("projectId")
  let claimed = null

  $app.dao().runInTransaction((txDao) => {
    try {
      txDao.findRecordById("projects", projectId)
    } catch {
      throw new NotFoundError("项目不存在")
    }

    const active = txDao.findRecordsByFilter(
      "pages",
      `project = "${projectId}" && proofreader = "${userId}" && (status = "claimed" || status = "proofreading")`,
      "page_number",
      1,
      0
    )
    if (active.length) {
      claimed = active[0]
      if (claimed.getString("status") === "claimed") {
        claimed.set("status", "proofreading")
        txDao.saveRecord(claimed)
      }
      return
    }

    const candidates = txDao.findRecordsByFilter(
      "pages",
      `project = "${projectId}" && (status = "pending" || status = "proofread")`,
      "page_number",
      100000,
      0
    )
    for (const page of candidates) {
      if (page.getString("status") === "proofread" && page.getString("first_proofreader") === userId) {
        continue
      }
      page.set("proofreader", userId)
      page.set("status", "proofreading")
      txDao.saveRecord(page)
      claimed = page
      break
    }
  })

  return c.json(200, claimed ? summarize(claimed) : null)
}, $apis.requireRecordAuth("users"))

// Reordering is a single server-side transaction. The request must contain
// each selected pending page exactly once. This supports paginated admin views
// while stale or cross-project selections are rejected in the transaction.
routerAdd("POST", `${FANGJI_API}/projects/:projectId/pages/reorder`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "admin") throw new ForbiddenError("无权执行此操作")
  const projectId = c.pathParam("projectId")
  const body = new DynamicModel({ orderedIds: [] })
  c.bind(body)
  if (!Array.isArray(body.orderedIds) || !body.orderedIds.length || body.orderedIds.length > 100000) {
    throw new BadRequestError("待校对条目顺序无效")
  }
  const orderedIds = body.orderedIds.map((id) => String(id))
  if (new Set(orderedIds).size !== orderedIds.length) throw new BadRequestError("待校对条目不能重复")

  $app.dao().runInTransaction((txDao) => {
    try { txDao.findRecordById("projects", projectId) } catch { throw new NotFoundError("项目不存在") }
    const pending = orderedIds.map((id) => {
      let page = null
      try { page = txDao.findRecordById("pages", id) } catch { throw new BadRequestError("待校对条目已变化，请刷新后重试") }
      if (page.getString("project") !== projectId || page.getString("status") !== "pending") {
        throw new BadRequestError("只能调整当前项目中仍待校对的条目")
      }
      return page
    })
    const pendingById = {}
    pending.forEach((page) => { pendingById[page.getId()] = page })

    const slots = pending.map((page) => page.getInt("page_number")).sort((a, b) => a - b)
    const all = txDao.findRecordsByFilter("pages", `project = "${projectId}"`, "-page_number", 100000, 0)
    const maxPageNumber = all.length ? all[0].getInt("page_number") : 0
    pending.forEach((page, index) => {
      page.set("page_number", maxPageNumber + index + 1)
      txDao.saveRecord(page)
    })
    orderedIds.forEach((id, index) => {
      const page = pendingById[id]
      page.set("page_number", slots[index])
      txDao.saveRecord(page)
    })
  })

  return c.json(200, { count: orderedIds.length })
}, $apis.requireRecordAuth("users"))

// Delete and project-wide resequencing are atomic. Only pages that are still
// pending at transaction time may be deleted.
routerAdd("POST", `${FANGJI_API}/projects/:projectId/pages/delete-pending`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "admin") throw new ForbiddenError("无权执行此操作")
  const projectId = c.pathParam("projectId")
  const body = new DynamicModel({ ids: [] })
  c.bind(body)
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100000) {
    throw new BadRequestError("待删除条目无效")
  }
  const ids = body.ids.map((id) => String(id))
  if (new Set(ids).size !== ids.length) throw new BadRequestError("待删除条目不能重复")

  $app.dao().runInTransaction((txDao) => {
    try { txDao.findRecordById("projects", projectId) } catch { throw new NotFoundError("项目不存在") }
    const targets = ids.map((id) => {
      let page = null
      try { page = txDao.findRecordById("pages", id) } catch { throw new BadRequestError("待删除条目不存在") }
      if (page.getString("project") !== projectId || page.getString("status") !== "pending") {
        throw new BadRequestError("只能删除当前项目中仍待校对的条目")
      }
      return page
    })
    targets.forEach((page) => txDao.deleteRecord(page))

    const remaining = txDao.findRecordsByFilter(
      "pages",
      `project = "${projectId}"`,
      "page_number,created",
      100000,
      0
    )
    const maxPageNumber = remaining.reduce((max, page) => Math.max(max, page.getInt("page_number")), 0)
    remaining.forEach((page, index) => {
      page.set("page_number", maxPageNumber + index + 1)
      txDao.saveRecord(page)
    })
    remaining.forEach((page, index) => {
      page.set("page_number", index + 1)
      txDao.saveRecord(page)
    })
  })

  return c.json(200, { deleted_count: ids.length })
}, $apis.requireRecordAuth("users"))

// The complete pass submission and comparison happens atomically on the
// server. First-pass content is persisted only in the private attempts table.
routerAdd("POST", `${FANGJI_API}/pages/:pageId/submit`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "proofreader") {
    throw new ForbiddenError("无权执行此操作")
  }
  const userId = auth.getId()
  const pageId = c.pathParam("pageId")
  const body = new DynamicModel({ rowJson: "", text: "" })
  c.bind(body)
  const parseRowObject = (raw) => {
    const value = String(raw || "")
    if (!value || value.length > 2 * 1024 * 1024) throw new BadRequestError("校对内容为空或过大")
    let parsed = null
    try { parsed = JSON.parse(value) } catch { throw new BadRequestError("校对内容格式无效") }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || !Object.keys(parsed).length) {
      throw new BadRequestError("校对内容必须是非空字段对象")
    }
    return parsed
  }
  const validateSubmittedRow = (raw, page) => {
    const parsed = parseRowObject(raw)
    let source = { "内容": page.getString("ocr_text") }
    try {
      const candidate = JSON.parse(page.getString("ocr_row_json"))
      if (candidate && !Array.isArray(candidate) && typeof candidate === "object" && Object.keys(candidate).length) source = candidate
    } catch {}
    const sourceKeys = Object.keys(source)
    const expectedKeys = sourceKeys.slice().sort()
    const actualKeys = Object.keys(parsed).sort()
    if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index])) {
      throw new BadRequestError(`校对字段必须与原始字段一致：${expectedKeys.join("、")}`)
    }
    for (const key of expectedKeys) {
      if (typeof parsed[key] !== "string") throw new BadRequestError(`字段“${key}”必须是文本`)
    }
    if (!expectedKeys.some((key) => parsed[key].trim() !== "")) throw new BadRequestError("校对内容不能全部为空")
    return { parsed, keys: sourceKeys }
  }
  const canonicalizeRow = (parsed) => {
    const result = {}
    Object.keys(parsed).sort().forEach((key) => { result[key] = parsed[key].trim() })
    return JSON.stringify(result)
  }
  const composeRowText = (keys, parsed) => keys.map((key) => parsed[key].trim()).filter(Boolean).join(" ")
  const now = new Date().toISOString()
  let response = null

  try {
    $app.dao().runInTransaction((txDao) => {
    let page = null
    try {
      page = txDao.findRecordById("pages", pageId)
    } catch {
      throw new NotFoundError("条目不存在")
    }

    const status = page.getString("status")
    if ((status !== "claimed" && status !== "proofreading") || page.getString("proofreader") !== userId) {
      throw new BadRequestError("该条目当前不属于你，请返回项目大厅刷新后重试")
    }

    const validatedRow = validateSubmittedRow(body.rowJson, page)
    const parsedRow = validatedRow.parsed
    const normalizedCurrent = canonicalizeRow(parsedRow)
    const rowJson = JSON.stringify(parsedRow)
    const text = composeRowText(validatedRow.keys, parsedRow)

    const attemptsCollection = txDao.findCollectionByNameOrId("proofreading_attempts")
    const round = page.getInt("proofread_round") || 1
    const firstProofreader = page.getString("first_proofreader")

    if (!firstProofreader) {
      const first = new Record(attemptsCollection)
      first.set("page", pageId)
      first.set("project", page.getString("project"))
      first.set("proofreader", userId)
      first.set("round", round)
      first.set("pass_no", 1)
      first.set("kind", "first")
      first.set("row_json", rowJson)
      first.set("text", text)
      first.set("outcome", "waiting")
      first.set("submitted_at", now)
      txDao.saveRecord(first)

      page.set("first_proofreader", userId)
      page.set("first_proofread_at", now)
      page.set("second_proofreader", null)
      page.set("second_proofread_at", null)
      page.set("proofread_row_json", "")
      page.set("proofread_text", "")
      page.set("proofread_at", now)
      page.set("status", "proofread")
      page.set("proofreader", null)
      txDao.saveRecord(page)

      response = {
        id: pageId,
        status: "proofread",
        outcome: "waiting",
        message: "校对结果已提交，系统将继续处理该条目。"
      }
      return
    }

    if (firstProofreader === userId) {
      throw new BadRequestError("该条目需要由其他校对员处理")
    }

    const firstAttempts = txDao.findRecordsByFilter(
      "proofreading_attempts",
      `page = "${pageId}" && round = ${round} && pass_no = 1`,
      "",
      1,
      0
    )
    if (!firstAttempts.length) {
      throw new BadRequestError("未找到该轮所需的校对记录，请联系管理员处理")
    }

    const first = firstAttempts[0]
    const normalizedFirst = canonicalizeRow(parseRowObject(first.getString("row_json")))
    const isMatch = normalizedFirst === normalizedCurrent

    const second = new Record(attemptsCollection)
    second.set("page", pageId)
    second.set("project", page.getString("project"))
    second.set("proofreader", userId)
    second.set("round", round)
    second.set("pass_no", 2)
    second.set("kind", "second")
    second.set("row_json", rowJson)
    second.set("text", text)
    second.set("outcome", isMatch ? "matched" : "mismatched")
    second.set("submitted_at", now)
    txDao.saveRecord(second)

    first.set("outcome", isMatch ? "matched" : "mismatched")
    txDao.saveRecord(first)

    page.set("second_proofreader", userId)
    page.set("second_proofread_at", now)
    page.set("proofread_at", now)
    page.set("proofreader", null)

    if (isMatch) {
      page.set("proofread_row_json", rowJson)
      page.set("proofread_text", text)
      page.set("status", "approved")
      txDao.saveRecord(page)
      response = {
        id: pageId,
        status: "approved",
        outcome: "matched",
        message: "校对结果已提交，该条目已完成。"
      }
      return
    }

    page.set("proofread_row_json", "")
    page.set("proofread_text", "")
    page.set("mismatch_count", page.getInt("mismatch_count") + 1)
    page.set("last_mismatch_at", now)
    page.set("status", "arbitration")
    txDao.saveRecord(page)
    response = {
      id: pageId,
      status: "arbitration",
      outcome: "mismatched",
      message: "校对结果已提交，该条目将由管理员继续处理。"
    }
    })
  } catch (error) {
    console.warn("Proofread submission failed:", pageId, error)
    throw error
  }

  return c.json(200, response)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", `${FANGJI_API}/pages/:pageId/arbitration`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "admin") {
    throw new ForbiddenError("无权执行此操作")
  }
  const summarizeAttempt = (dao, attempt) => {
    let displayName = attempt.getString("proofreader")
    try {
      const user = dao.findRecordById("users", attempt.getString("proofreader"))
      displayName = user.getString("name") || user.getString("email") || displayName
    } catch {}
    return {
      id: attempt.getId(),
      proofreader: attempt.getString("proofreader"),
      proofreader_name: displayName,
      round: attempt.getInt("round"),
      pass_no: attempt.getInt("pass_no"),
      kind: attempt.getString("kind"),
      row_json: attempt.getString("row_json"),
      text: attempt.getString("text"),
      outcome: attempt.getString("outcome"),
      submitted_at: String(attempt.get("submitted_at") || "")
    }
  }
  const pageId = c.pathParam("pageId")
  const dao = $app.dao()

  let page = null
  try {
    page = dao.findRecordById("pages", pageId)
  } catch {
    throw new NotFoundError("条目不存在")
  }
  if (page.getString("status") !== "arbitration") {
    throw new BadRequestError("该条目当前不需要仲裁")
  }

  const round = page.getInt("proofread_round") || 1
  const attempts = dao.findRecordsByFilter(
    "proofreading_attempts",
    `page = "${pageId}" && round = ${round}`,
    "pass_no",
    100,
    0
  )

  return c.json(200, {
    page: {
      id: page.getId(),
      project: page.getString("project"),
      project_file: page.getString("project_file"),
      page_number: page.getInt("page_number"),
      pdf_page: page.getInt("pdf_page"),
      status: page.getString("status"),
      proofreader: page.getString("proofreader"),
      first_proofreader: page.getString("first_proofreader"),
      second_proofreader: page.getString("second_proofreader"),
      proofread_round: page.getInt("proofread_round") || 1,
      mismatch_count: page.getInt("mismatch_count") || 0,
      ocr_row_json: page.getString("ocr_row_json"),
      ocr_text: page.getString("ocr_text")
    },
    attempts: attempts.map((attempt) => summarizeAttempt(dao, attempt))
  })
}, $apis.requireRecordAuth("users"))

routerAdd("POST", `${FANGJI_API}/pages/:pageId/arbitrate`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "admin") {
    throw new ForbiddenError("无权执行此操作")
  }
  const pageId = c.pathParam("pageId")
  const body = new DynamicModel({ rowJson: "", text: "", note: "" })
  c.bind(body)
  const validateSubmittedRow = (raw, page) => {
    const value = String(raw || "")
    if (!value || value.length > 2 * 1024 * 1024) throw new BadRequestError("校对内容为空或过大")
    let parsed = null
    try { parsed = JSON.parse(value) } catch { throw new BadRequestError("校对内容格式无效") }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || !Object.keys(parsed).length) {
      throw new BadRequestError("校对内容必须是非空字段对象")
    }
    let source = { "内容": page.getString("ocr_text") }
    try {
      const candidate = JSON.parse(page.getString("ocr_row_json"))
      if (candidate && !Array.isArray(candidate) && typeof candidate === "object" && Object.keys(candidate).length) source = candidate
    } catch {}
    const sourceKeys = Object.keys(source)
    const expectedKeys = sourceKeys.slice().sort()
    const actualKeys = Object.keys(parsed).sort()
    if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index])) {
      throw new BadRequestError(`校对字段必须与原始字段一致：${expectedKeys.join("、")}`)
    }
    for (const key of expectedKeys) {
      if (typeof parsed[key] !== "string") throw new BadRequestError(`字段“${key}”必须是文本`)
    }
    if (!expectedKeys.some((key) => parsed[key].trim() !== "")) throw new BadRequestError("校对内容不能全部为空")
    return { parsed, keys: sourceKeys }
  }
  const composeRowText = (keys, parsed) => keys.map((key) => parsed[key].trim()).filter(Boolean).join(" ")
  const note = String(body.note || "").slice(0, 4000)
  const now = new Date().toISOString()
  let response = null

  $app.dao().runInTransaction((txDao) => {
    let page = null
    try {
      page = txDao.findRecordById("pages", pageId)
    } catch {
      throw new NotFoundError("条目不存在")
    }
    if (page.getString("status") !== "arbitration") {
      throw new BadRequestError("该条目当前不需要仲裁")
    }

    const validatedRow = validateSubmittedRow(body.rowJson, page)
    const parsedRow = validatedRow.parsed
    const rowJson = JSON.stringify(parsedRow)
    const text = composeRowText(validatedRow.keys, parsedRow)

    const round = page.getInt("proofread_round") || 1
    const existing = txDao.findRecordsByFilter(
      "proofreading_attempts",
      `page = "${pageId}" && round = ${round} && pass_no = 3`,
      "",
      1,
      0
    )
    if (existing.length) {
      throw new BadRequestError("该条目已经完成仲裁")
    }

    const attempt = new Record(txDao.findCollectionByNameOrId("proofreading_attempts"))
    attempt.set("page", pageId)
    attempt.set("project", page.getString("project"))
    attempt.set("proofreader", auth.getId())
    attempt.set("round", round)
    attempt.set("pass_no", 3)
    attempt.set("kind", "arbitration")
    attempt.set("row_json", rowJson)
    attempt.set("text", text)
    attempt.set("outcome", "arbitrated")
    attempt.set("submitted_at", now)
    txDao.saveRecord(attempt)

    page.set("proofread_row_json", rowJson)
    page.set("proofread_text", text)
    page.set("proofread_at", now)
    page.set("arbitrated_by", auth.getId())
    page.set("arbitrated_at", now)
    page.set("arbitration_note", note)
    page.set("status", "approved")
    page.set("proofreader", null)
    txDao.saveRecord(page)

    response = {
      id: pageId,
      status: "approved",
      message: "仲裁结果已保存，条目已完成。"
    }
  })

  return c.json(200, response)
}, $apis.requireRecordAuth("users"))

routerAdd("GET", `${FANGJI_API}/proofreader-stats`, (c) => {
  const auth = c.get("authRecord")
  if (!auth || auth.getString("role") !== "proofreader") {
    throw new ForbiddenError("无权执行此操作")
  }
  const dao = $app.dao()
  const aggregated = arrayOf(new DynamicModel({
    user_id: "",
    project_count: 0,
    proofread_count: 0,
    evaluated_count: 0,
    matched_count: 0
  }))
  dao.db()
    .select(
      "proofreader AS user_id",
      "COUNT(DISTINCT project) AS project_count",
      "COUNT(*) AS proofread_count",
      "SUM(CASE WHEN outcome = 'matched' OR outcome = 'mismatched' THEN 1 ELSE 0 END) AS evaluated_count",
      "SUM(CASE WHEN outcome = 'matched' THEN 1 ELSE 0 END) AS matched_count"
    )
    .from("proofreading_attempts")
    .where($dbx.exp("proofreader != '' AND (kind = 'first' OR kind = 'second')"))
    .groupBy("proofreader")
    .all(aggregated)

  if (!aggregated.some((item) => item.user_id === auth.getId())) {
    aggregated.push(new DynamicModel({
      user_id: auth.getId(),
      project_count: 0,
      proofread_count: 0,
      evaluated_count: 0,
      matched_count: 0
    }))
  }

  const profiles = aggregated.map((item) => {
    return {
      userId: item.user_id,
      projectCount: item.project_count,
      proofreadCount: item.proofread_count,
      evaluatedCount: item.evaluated_count,
      correctCount: item.matched_count,
      accuracy: item.evaluated_count
        ? Math.round(item.matched_count / item.evaluated_count * 1000) / 10
        : 0
    }
  })

  function rank(sorted, userId, valueKey) {
    const index = sorted.findIndex((item) => item.userId === userId)
    if (index < 0) return null
    let result = 1
    for (let i = 1; i <= index; i += 1) {
      if (sorted[i - 1][valueKey] !== sorted[i][valueKey]) result = i + 1
    }
    return result
  }

  const accuracySorted = profiles.slice().sort((a, b) =>
    (b.accuracy - a.accuracy) ||
    (b.evaluatedCount - a.evaluatedCount) ||
    a.userId.localeCompare(b.userId)
  )
  const countSorted = profiles.slice().sort((a, b) =>
    (b.proofreadCount - a.proofreadCount) ||
    (b.accuracy - a.accuracy) ||
    a.userId.localeCompare(b.userId)
  )
  const current = profiles.find((item) => item.userId === auth.getId())

  return c.json(200, {
    ...current,
    accuracyRank: rank(accuracySorted, auth.getId(), "accuracy"),
    proofreadRank: rank(countSorted, auth.getId(), "proofreadCount"),
    rankedProofreaderCount: profiles.length
  })
}, $apis.requireRecordAuth("users"))
