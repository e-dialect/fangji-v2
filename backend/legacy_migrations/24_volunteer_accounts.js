/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId("users")
  users.schema.addField(new SchemaField({
    name: "must_change_password",
    type: "bool",
    required: false,
    options: {}
  }))
  dao.saveCollection(users)
  for (const user of dao.findRecordsByFilter("users", 'id != ""', "created", 1000000, 0)) {
    user.set("must_change_password", false)
    dao.saveRecord(user)
  }
}, (db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId("users")
  const field = users.schema.getFieldByName("must_change_password")
  if (field) users.schema.removeField(field.id)
  dao.saveCollection(users)
})
