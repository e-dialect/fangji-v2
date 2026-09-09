package main

import (
	"bytes"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"os"
	"testing"
)

func newSchemaTestApp(t *testing.T) *pocketbase.PocketBase {
	t.Helper()
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })
	raw, err := os.ReadFile("pb_migrations/1788940000_initial_schema.js")
	if err != nil {
		t.Fatal(err)
	}
	raw = raw[bytes.IndexByte(raw, '[') : bytes.LastIndex(raw, []byte("];"))+1]
	if err := app.ImportCollectionsByMarshaledJSON(raw, false); err != nil {
		t.Fatal(err)
	}
	return app
}
func TestFreshSchemaSecurityAndLimits(t *testing.T) {
	app := newSchemaTestApp(t)
	for _, name := range []string{"project_access_secrets", "project_join_attempts", "project_join_source_attempts", "task_leases"} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatal(err)
		}
		if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil || collection.UpdateRule != nil || collection.DeleteRule != nil {
			t.Fatalf("%s must not expose native records", name)
		}
	}
	files, err := app.FindCollectionByNameOrId("project_files")
	if err != nil {
		t.Fatal(err)
	}
	field := files.Fields.GetByName("file").(*core.FileField)
	if field.MaxSize != 100*1024*1024 || !field.Protected {
		t.Fatalf("unexpected PDF settings: %+v", field)
	}
	pages, err := app.FindCollectionByNameOrId("pages")
	if err != nil {
		t.Fatal(err)
	}
	if pages.Fields.GetByName("row_headers_json") == nil {
		t.Fatal("missing column-order snapshot")
	}
}
