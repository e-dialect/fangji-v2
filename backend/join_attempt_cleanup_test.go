package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func seedJoinAttempt(t *testing.T, app core.App, table, id string, window, blocked time.Time) {
	t.Helper()
	format := func(v time.Time) string {
		if v.IsZero() {
			return ""
		}
		return v.UTC().Format("2006-01-02 15:04:05.000Z")
	}
	key := "user"
	if table == "project_join_source_attempts" {
		key = "source_key"
	}
	_, err := app.DB().NewQuery(fmt.Sprintf("INSERT INTO %s(id,%s,window_started,blocked_until) VALUES ({:id},{:id},{:window},{:blocked})", table, key)).Bind(dbx.Params{"id": id, "window": format(window), "blocked": format(blocked)}).Execute()
	if err != nil {
		t.Fatal(err)
	}
}

func TestJoinCleanupRetentionAndBatch(t *testing.T) {
	app := newSchemaTestApp(t)
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	for _, table := range []string{"project_join_attempts", "project_join_source_attempts"} {
		for i := 0; i < 3; i++ {
			seedJoinAttempt(t, app, table, fmt.Sprintf("old%012d", i), now.Add(-48*time.Hour), time.Time{})
		}
		seedJoinAttempt(t, app, table, "fresh0000000001", now.Add(-time.Minute), time.Time{})
		seedJoinAttempt(t, app, table, "active000000001", now.Add(-48*time.Hour), now.Add(time.Hour))
		seedJoinAttempt(t, app, table, "recentblock0001", now.Add(-48*time.Hour), now.Add(-23*time.Hour))
		seedJoinAttempt(t, app, table, "zero00000000001", time.Time{}, time.Time{})
	}
	n, err := cleanupJoinAttempts(app, now, 2)
	if err != nil || n != 4 {
		t.Fatalf("first batch %d: %v", n, err)
	}
	n, err = cleanupJoinAttempts(app, now, 2)
	if err != nil || n != 2 {
		t.Fatalf("second batch %d: %v", n, err)
	}
	n, err = cleanupJoinAttempts(app, now, 2)
	if err != nil || n != 0 {
		t.Fatalf("protected records deleted %d: %v", n, err)
	}
	for _, table := range []string{"project_join_attempts", "project_join_source_attempts"} {
		var count int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + table).Row(&count); err != nil || count != 4 {
			t.Fatalf("%s count %d: %v", table, count, err)
		}
	}
}

func TestJoinCleanupWaitsForConcurrentRefresh(t *testing.T) {
	app := newSchemaTestApp(t)
	now := time.Now().UTC()
	for _, table := range []string{"project_join_attempts", "project_join_source_attempts"} {
		seedJoinAttempt(t, app, table, "refreshed000001", now.Add(-48*time.Hour), time.Time{})
		done := make(chan error, 1)
		err := app.RunInTransaction(func(tx core.App) error {
			// The joining request holds SQLite's writer until its new block commits.
			_, err := tx.DB().NewQuery("UPDATE " + table + " SET window_started={:window},blocked_until={:blocked} WHERE id='refreshed000001'").Bind(dbx.Params{"window": now.Format("2006-01-02 15:04:05.000Z"), "blocked": now.Add(15 * time.Minute).Format("2006-01-02 15:04:05.000Z")}).Execute()
			if err != nil {
				return err
			}
			started := make(chan struct{})
			go func() { close(started); _, err := cleanupJoinAttempts(app, now, 250); done <- err }()
			<-started
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("cleanup blocked")
		}
		var count int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + table + " WHERE id='refreshed000001'").Row(&count); err != nil || count != 1 {
			t.Fatalf("refreshed block removed from %s: %v", table, err)
		}
	}
}

func TestJoinCleanupHasOneProcessSchedule(t *testing.T) {
	app := newSchemaTestApp(t)
	for i := 0; i < 25; i++ {
		registerJoinAttemptCleanup(app)
	}
	count := 0
	for _, job := range app.Cron().Jobs() {
		if job.Id() == "cleanup-project-join-attempts" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("registered %d cleanup schedules", count)
	}
}
