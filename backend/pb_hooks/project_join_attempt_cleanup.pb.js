/// <reference path="../pb_data/types.d.ts" />

cronAdd("cleanup-project-join-attempts", "17 * * * *", () => {
  const { cleanupExpiredProjectJoinAttempts } = require(`${__hooks}/lib/project_access.js`)
  cleanupExpiredProjectJoinAttempts($app.dao(), Date.now(), 250)
})
