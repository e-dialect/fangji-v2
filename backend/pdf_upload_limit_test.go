package main

import (
	"mime/multipart"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tests"
)

func TestPDFUploadSizeBoundaries(t *testing.T) {
	for _, size := range []int64{80 * 1024 * 1024, 100 * 1024 * 1024, 100*1024*1024 + 1} {
		err := validateUploadHeader(&multipart.FileHeader{Filename: "original.pdf", Size: size}, ".pdf", maxPDFBytes)
		if (err == nil) != (size <= 100*1024*1024) {
			t.Fatalf("PDF size %d: %v", size, err)
		}
	}
	if err := validateUploadHeader(&multipart.FileHeader{Filename: "source.csv", Size: 50*1024*1024 + 1}, ".csv", maxCSVBytes); err == nil {
		t.Fatal("CSV limit must remain 50 MiB")
	}
}

func TestPDFUploadLimitMigration(t *testing.T) {
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
	applyProjectMigrationsThrough(t, app, migrations, 27)
	before, err := app.Dao().FindCollectionByNameOrId("project_files")
	if err != nil {
		t.Fatal(err)
	}
	original := *before.Schema.GetFieldByName("file").Options.(*schema.FileOptions)
	migration := findProjectMigration(t, migrations, "28_increase_pdf_upload_limit.js")
	for _, upgrade := range []bool{true, false} {
		apply := migration.Up
		want := original
		if upgrade {
			want.MaxSize = 100 * 1024 * 1024
		} else {
			apply = migration.Down
		}
		if err := app.DB().Transactional(func(tx *dbx.Tx) error { return apply(tx) }); err != nil {
			t.Fatal(err)
		}
		after, err := app.Dao().FindCollectionByNameOrId("project_files")
		if err != nil {
			t.Fatal(err)
		}
		got := after.Schema.GetFieldByName("file").Options.(*schema.FileOptions)
		if !reflect.DeepEqual(*got, want) || !reflect.DeepEqual(before.ViewRule, after.ViewRule) {
			t.Fatalf("upgrade=%v: options=%+v; want %+v with unchanged access rule", upgrade, got, want)
		}
	}
}
