// Protect existing originals as well as future uploads. File tokens still obey
// the current view rule, so a proofreader cannot use one to fetch the full PDF.
migrate((db) => {
 const dao = new Dao(db)
 const files = dao.findCollectionByNameOrId("project_files")
 const rule = '@request.auth.id != "" && (@request.auth.role = "platform_admin" || project.admin = @request.auth.id || project.acl.managers.id ?= @request.auth.id)'
 files.listRule = rule
 files.viewRule = rule
 files.schema.getFieldByName("file").options.protected = true
 dao.saveCollection(files)
}, (db) => {
 const dao = new Dao(db)
 const files = dao.findCollectionByNameOrId("project_files")
 const rule = '@request.auth.id != "" && ( @request.auth.role = "platform_admin" || project.admin = @request.auth.id || project.acl.members.id ?= @request.auth.id )'
 files.listRule = rule
 files.viewRule = rule
 files.schema.getFieldByName("file").options.protected = false
 dao.saveCollection(files)
})
