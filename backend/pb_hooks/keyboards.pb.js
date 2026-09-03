/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/fangji/keyboards", (c) => {
  const { auth: fangjiAuth } = require(`${__hooks}/lib/project_access.js`)
  const { keyboardJson: fangjiKeyboardJson, library: fangjiKeyboardLibrary } = require(`${__hooks}/lib/keyboards.js`)
  fangjiAuth(c)
  return c.json(200, fangjiKeyboardLibrary($app.dao()).map(fangjiKeyboardJson))
}, $apis.requireRecordAuth("users"))

routerAdd("GET", "/api/fangji/projects/:projectId/keyboards", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, project: fangjiProject, capabilities: fangjiCapabilities } = require(`${__hooks}/lib/project_access.js`)
  const { projectConfig: fangjiProjectKeyboardConfig } = require(`${__hooks}/lib/keyboards.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const dao = $app.dao()
  const project = fangjiProject(dao, projectId)
  const capabilities = fangjiCapabilities(dao, project, auth)
  if (!capabilities.isMember && !capabilities.isPlatformAdmin) throw new ForbiddenError("你不是该项目成员")
  return c.json(200, fangjiProjectKeyboardConfig(dao, projectId))
}, $apis.requireRecordAuth("users"))

routerAdd("PUT", "/api/fangji/projects/:projectId/keyboards", (c) => {
  const { auth: fangjiAuth, assertId: fangjiAssertId, requireManager: fangjiRequireManager } = require(`${__hooks}/lib/project_access.js`)
  const { configureProjectKeyboards: fangjiConfigureProjectKeyboards } = require(`${__hooks}/lib/keyboards.js`)
  const auth = fangjiAuth(c)
  const projectId = fangjiAssertId(c.pathParam("projectId"), "项目")
  const body = new DynamicModel({ keyboardIds: [], defaultKeyboardId: "" })
  c.bind(body)
  if (!Array.isArray(body.keyboardIds)) throw new BadRequestError("键盘列表格式无效")
  let result = null
  $app.dao().runInTransaction((txDao) => {
    fangjiRequireManager(txDao, projectId, auth)
    result = fangjiConfigureProjectKeyboards(txDao, projectId, body.keyboardIds, body.defaultKeyboardId)
  })
  return c.json(200, result)
}, $apis.requireRecordAuth("users"))
