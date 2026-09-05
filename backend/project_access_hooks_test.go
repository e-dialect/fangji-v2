package main

import (
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/tests"
)

func TestProjectHooksLoad(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("create test app: %v", err)
	}
	defer app.Cleanup()

	hooksDir, err := filepath.Abs("pb_hooks")
	if err != nil {
		t.Fatal(err)
	}
	jsvm.MustRegister(app, jsvm.Config{
		HooksDir:      hooksDir,
		HooksWatch:    false,
		HooksPoolSize: 1,
		MigrationsDir: t.TempDir(),
		TypesDir:      t.TempDir(),
	})
}
