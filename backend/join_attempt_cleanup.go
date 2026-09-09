package main

import (
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Cleanup belongs to the application scheduler, not a JS runtime or request.
func registerJoinAttemptCleanup(app core.App) {
	app.Cron().MustAdd("cleanup-project-join-attempts", "17 * * * *", func() {
		if _, err := cleanupJoinAttempts(app, time.Now(), 250); err != nil {
			app.Logger().Error("project join attempt cleanup failed", "error", err)
		}
	})
}

func cleanupJoinAttempts(app core.App, now time.Time, batchSize int) (int64, error) {
	if batchSize < 1 {
		batchSize = 250
	}
	batchSize = min(batchSize, 1000)
	params := dbx.Params{
		"window":  now.UTC().Add(-24*time.Hour - 15*time.Minute).Format("2006-01-02 15:04:05.000Z"),
		"blocked": now.UTC().Add(-24 * time.Hour).Format("2006-01-02 15:04:05.000Z"),
		"limit":   batchSize,
	}
	var deleted int64
	// Each DELETE selects and checks eligibility in the same SQLite statement.
	// A concurrent join can commit either before or after it, never between a
	// stale record read and an unconditional delete. These private bookkeeping
	// records have no dependants or delete hooks; no record API events are needed.
	for _, table := range []string{"project_join_attempts", "project_join_source_attempts"} {
		result, err := app.DB().NewQuery(fmt.Sprintf(`DELETE FROM %s WHERE id IN (
   SELECT id FROM %s WHERE window_started != '' AND window_started <= {:window}
   AND blocked_until <= {:blocked} ORDER BY window_started,id LIMIT {:limit}
  )`, table, table)).Bind(params).Execute()
		if err != nil {
			return deleted, err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return deleted, err
		}
		deleted += n
	}
	return deleted, nil
}
