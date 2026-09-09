// Collection metadata keeps the indexes when PocketBase updates the schema.
migrate((app) => {
  for (const [table, name] of [
    ["project_join_attempts", "idx_project_join_attempt_window"],
    ["project_join_source_attempts", "idx_project_join_source_attempt_window"]
  ]) {
    const collection = app.findCollectionByNameOrId(table)
    collection.indexes = [...collection.indexes, `CREATE INDEX ${name} ON ${table} (window_started, id)`]
    app.save(collection)
  }
}, (app) => {
  for (const [table, name] of [
    ["project_join_attempts", "idx_project_join_attempt_window"],
    ["project_join_source_attempts", "idx_project_join_source_attempt_window"]
  ]) {
    const collection = app.findCollectionByNameOrId(table)
    collection.indexes = collection.indexes.filter(sql => !sql.includes(name))
    app.save(collection)
  }
})
