package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestEmbeddedKeyboardPresetsAreValid(t *testing.T) {
	presets, err := loadKeyboardPresets(embeddedKeyboardFiles)
	if err != nil {
		t.Fatalf("load embedded presets: %v", err)
	}
	preset, ok := presets[defaultKeyboardID]
	if !ok {
		t.Fatalf("default preset %q is missing", defaultKeyboardID)
	}
	if preset.Definition.Name != "莆仙方言键盘" {
		t.Fatalf("unexpected preset name %q", preset.Definition.Name)
	}
	if len(preset.Definition.Sections) != 7 {
		t.Fatalf("expected 7 sections, got %d", len(preset.Definition.Sections))
	}
}

func TestKeyboardDefinitionRejectsUnknownFields(t *testing.T) {
	_, _, err := decodeKeyboardDefinition([]byte(`{
		"schemaVersion": 1,
		"id": "test-keyboard",
		"name": "Test",
		"description": "",
		"unexpected": true,
		"sections": [{"id":"common","label":"Common","defaultOpen":true,"keys":[{"value":"ŋ"}]}]
	}`))
	if err == nil {
		t.Fatal("expected an unknown-field validation error")
	}
}

func TestKeyboardDefinitionsRejectDuplicateIDs(t *testing.T) {
	source := fstest.MapFS{
		"keyboards/one.json": {Data: []byte(`{"schemaVersion":1,"id":"same-keyboard","name":"One","description":"","sections":[{"id":"common","label":"Common","defaultOpen":true,"keys":[{"value":"a"}]}]}`)},
		"keyboards/two.json": {Data: []byte(`{"schemaVersion":1,"id":"same-keyboard","name":"Two","description":"","sections":[{"id":"common","label":"Common","defaultOpen":true,"keys":[{"value":"b"}]}]}`)},
	}
	if _, err := loadKeyboardPresets(source); err == nil {
		t.Fatal("expected duplicate keyboard IDs to be rejected")
	}
}

func TestKeyboardPresetsSyncDuringSingleServeUpgrade(t *testing.T) {
	migrationsDir, err := filepath.Abs("pb_migrations")
	if err != nil {
		t.Fatal(err)
	}
	tempDir := t.TempDir()
	emptyHooksDir := filepath.Join(tempDir, "empty_hooks")
	if err := os.MkdirAll(emptyHooksDir, 0o755); err != nil {
		t.Fatalf("create empty hooks directory: %v", err)
	}

	legacyApp, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("create legacy test app: %v", err)
	}
	defer legacyApp.Cleanup()
	dataDir := legacyApp.DataDir()
	projectMigrations := loadProjectMigrations(t, legacyApp, migrationsDir, emptyHooksDir)
	applyProjectMigrationsThrough(t, legacyApp, projectMigrations, 20)
	if _, err := legacyApp.Dao().FindCollectionByNameOrId("keyboards"); err == nil {
		t.Fatal("migration 20 database unexpectedly contains keyboards")
	}
	if err := legacyApp.ResetBootstrapState(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	upgradedApp := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dataDir})
	defer upgradedApp.ResetBootstrapState()
	loadProjectMigrations(t, upgradedApp, migrationsDir, emptyHooksDir)
	if err := registerKeyboardPresets(upgradedApp); err != nil {
		t.Fatalf("register keyboard presets: %v", err)
	}
	if err := upgradedApp.Bootstrap(); err != nil {
		t.Fatalf("bootstrap upgraded app: %v", err)
	}

	stopBeforeListen := errors.New("stop before test server listens")
	upgradedApp.OnBeforeServe().Add(func(_ *core.ServeEvent) error {
		return stopBeforeListen
	})
	_, err = apis.Serve(upgradedApp, apis.ServeConfig{HttpAddr: "127.0.0.1:0"})
	if !errors.Is(err, stopBeforeListen) {
		t.Fatalf("single serve upgrade returned %v, want test stop sentinel", err)
	}

	presets, err := upgradedApp.Dao().FindRecordsByFilter(
		"keyboards",
		`origin = "preset" && active = true`,
		"",
		100,
		0,
	)
	if err != nil {
		t.Fatalf("list synchronized presets: %v", err)
	}
	if len(presets) != 1 || presets[0].GetString("keyboard_id") != defaultKeyboardID {
		t.Fatalf("single serve upgrade synchronized presets = %#v", presets)
	}
}
