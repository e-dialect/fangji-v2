const defaultKeyboardID = "hinghwa-dialect"

function keyboardJson(record) {
  let definition = null
  try { definition = JSON.parse(record.getString("definition_json")) } catch {
    throw new BadRequestError(`键盘 ${record.getString("keyboard_id")} 的定义已损坏`)
  }
  return {
    recordId: record.getId(),
    keyboardId: record.getString("keyboard_id"),
    schemaVersion: record.getInt("schema_version"),
    name: record.getString("name"),
    description: record.getString("description"),
    origin: record.getString("origin"),
    active: record.getBool("active"),
    definition
  }
}

function library(dao) {
  return dao.findRecordsByFilter("keyboards", "active = true", "name", 1000, 0)
}

function projectLinks(dao, projectId) {
  return dao.findRecordsByFilter(
    "project_keyboards",
    `project = "${projectId}"`,
    "sort_order,created",
    1000,
    0
  )
}

function projectConfig(dao, projectId) {
  const items = []
  let defaultKeyboardId = null
  for (const link of projectLinks(dao, projectId)) {
    if (!link.getBool("enabled")) continue
    let keyboard = null
    try { keyboard = dao.findRecordById("keyboards", link.getString("keyboard")) } catch { continue }
    if (!keyboard.getBool("active")) continue
    const item = keyboardJson(keyboard)
    items.push(item)
    if (link.getBool("is_default")) defaultKeyboardId = item.keyboardId
  }
  if (!defaultKeyboardId && items.length) defaultKeyboardId = items[0].keyboardId
  return { items, defaultKeyboardId }
}

function enableDefaultKeyboard(dao, projectId) {
  const keyboards = dao.findRecordsByFilter(
    "keyboards",
    `keyboard_id = "${defaultKeyboardID}" && active = true`,
    "",
    1,
    0
  )
  if (!keyboards.length) return null
  const records = dao.findRecordsByFilter(
    "project_keyboards",
    `project = "${projectId}" && keyboard = "${keyboards[0].getId()}"`,
    "",
    1,
    0
  )
  const link = records.length
    ? records[0]
    : new Record(dao.findCollectionByNameOrId("project_keyboards"))
  link.set("project", projectId)
  link.set("keyboard", keyboards[0].getId())
  link.set("enabled", true)
  link.set("is_default", true)
  link.set("sort_order", 0)
  dao.saveRecord(link)
  return link
}

function configureProjectKeyboards(dao, projectId, keyboardIds, defaultKeyboardId) {
  const requested = [...new Set(keyboardIds.map((value) => String(value || "").trim()).filter(Boolean))]
  if (requested.length !== keyboardIds.length) throw new BadRequestError("启用的键盘不能包含空值或重复项")
  if (requested.length > 100) throw new BadRequestError("单个项目最多启用 100 个键盘")
  const requestedSet = new Set(requested)
  const chosenDefault = String(defaultKeyboardId || "").trim()
  if ((requested.length === 0 && chosenDefault) || (requested.length > 0 && !requestedSet.has(chosenDefault))) {
    throw new BadRequestError("默认键盘必须是本项目已启用的键盘")
  }

  const activeByID = new Map()
  for (const keyboard of library(dao)) activeByID.set(keyboard.getString("keyboard_id"), keyboard)
  const missing = requested.filter((id) => !activeByID.has(id))
  if (missing.length) throw new BadRequestError(`键盘不存在或已停用：${missing.join("、")}`)

  const linksByKeyboard = new Map()
  for (const link of projectLinks(dao, projectId)) linksByKeyboard.set(link.getString("keyboard"), link)
  for (const [index, keyboardId] of requested.entries()) {
    const keyboard = activeByID.get(keyboardId)
    let link = linksByKeyboard.get(keyboard.getId())
    if (!link) link = new Record(dao.findCollectionByNameOrId("project_keyboards"))
    link.set("project", projectId)
    link.set("keyboard", keyboard.getId())
    link.set("enabled", true)
    link.set("is_default", keyboardId === chosenDefault)
    link.set("sort_order", index)
    dao.saveRecord(link)
    linksByKeyboard.delete(keyboard.getId())
  }
  for (const link of linksByKeyboard.values()) {
    link.set("enabled", false)
    link.set("is_default", false)
    dao.saveRecord(link)
  }
  return projectConfig(dao, projectId)
}

module.exports = {
  keyboardJson,
  library,
  projectConfig,
  enableDefaultKeyboard,
  configureProjectKeyboards
}
