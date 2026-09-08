package main

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"
	"path/filepath"
	"testing"
)

func TestColumnOrderMigrationRecoversExistingInspection(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	dir, err := filepath.Abs("pb_migrations")
	if err != nil {
		t.Fatal(err)
	}
	migrations := loadProjectMigrations(t, app, dir, t.TempDir())
	applyProjectMigrationsThrough(t, app, migrations, 25)
	_, err = app.Dao().DB().NewQuery(`INSERT INTO import_jobs (id,inspection_json) VALUES ('legacyorderjob1', '{"headers":["词条","10","PDF页码","释义","2"],"pdf_page_field":"PDF页码"}')`).Execute()
	if err != nil {
		t.Fatal(err)
	}
	_, err = app.Dao().DB().NewQuery(`INSERT INTO pages (id,import_job,ocr_row_json,ocr_text) VALUES ('legacyorderpage','legacyorderjob1','{"10":"十","2":"二","词条":"𢶀","释义":"意思"}','𢶀 十 意思 二')`).Execute()
	if err != nil {
		t.Fatal(err)
	}
	migration := findProjectMigration(t, migrations, "26_csv_column_order.js")
	if err := app.DB().Transactional(func(tx *dbx.Tx) error { return migration.Up(tx) }); err != nil {
		t.Fatal(err)
	}
	page, err := app.Dao().FindRecordById("pages", "legacyorderpage")
	if err != nil {
		t.Fatal(err)
	}
	if got := page.GetString("row_headers_json"); got != `["词条","10","释义","2"]` {
		t.Fatalf("historical order=%s", got)
	}
	if page.GetString("ocr_text") != "𢶀 十 意思 二" {
		t.Fatal("original content changed")
	}
	if err := app.DB().Transactional(func(tx *dbx.Tx) error { return migration.Down(tx) }); err != nil {
		t.Fatal(err)
	}
	page, err = app.Dao().FindRecordById("pages", "legacyorderpage")
	if err != nil || page.GetString("ocr_text") != "𢶀 十 意思 二" {
		t.Fatalf("rollback lost original: %v", err)
	}
}
