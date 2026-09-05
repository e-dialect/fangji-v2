/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const indexes = [
    ["project_join_attempts", "idx_project_join_attempt_window"],
    ["project_join_source_attempts", "idx_project_join_source_attempt_window"]
  ]
  for (const [collectionName, indexName] of indexes) {
    const collection = dao.findCollectionByNameOrId(collectionName)
    if (!collection.indexes.some((index) => index.includes(indexName))) {
      collection.indexes = [
        ...collection.indexes,
        `CREATE INDEX ${indexName} ON ${collectionName} (window_started)`
      ]
      dao.saveCollection(collection)
    }
  }
}, (db) => {
  const dao = new Dao(db)
  const indexes = [
    ["project_join_attempts", "idx_project_join_attempt_window"],
    ["project_join_source_attempts", "idx_project_join_source_attempt_window"]
  ]
  for (const [collectionName, indexName] of indexes) {
    const collection = dao.findCollectionByNameOrId(collectionName)
    const retained = collection.indexes.filter((index) => !index.includes(indexName))
    if (retained.length !== collection.indexes.length) {
      collection.indexes = retained
      dao.saveCollection(collection)
    }
  }
})
