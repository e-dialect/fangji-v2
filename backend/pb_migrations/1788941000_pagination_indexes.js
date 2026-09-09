migrate((app) => {
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_pages_project_status_order ON pages(project,status,page_number,id)").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_attempts_page_round_kind_user ON proofreading_attempts(page,round,kind,proofreader)").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_membership_user_role_project ON project_memberships(user,role,project)").execute()
}, (app) => {
  for (const name of ["idx_pages_project_status_order","idx_attempts_page_round_kind_user","idx_membership_user_role_project"]) app.db().newQuery(`DROP INDEX IF EXISTS ${name}`).execute()
})
