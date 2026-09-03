package main

import (
	"testing"
	"testing/fstest"
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
