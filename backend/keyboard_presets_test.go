package main

import (
	"testing"
	"testing/fstest"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
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
	if len(preset.Definition.Sections) != 12 {
		t.Fatalf("expected 12 sections, got %d", len(preset.Definition.Sections))
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

func TestKeyboardPresetsSyncOnFreshServe(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := registerKeyboardPresets(app); err != nil {
		t.Fatal(err)
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}); err != nil {
		t.Fatal(err)
	}
	presets, err := app.FindRecordsByFilter("keyboards", `origin = "preset" && active = true`, "", 100, 0)
	if err != nil || len(presets) != 1 || presets[0].GetString("keyboard_id") != defaultKeyboardID {
		t.Fatalf("presets: %v %v", presets, err)
	}
}

func TestDictionaryKeyboardExactSymbolsAndCombiningMarks(t *testing.T) {
	presets, err := loadKeyboardPresets(embeddedKeyboardFiles)
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]keyboardKey{}
	for _, section := range presets[defaultKeyboardID].Definition.Sections {
		for _, key := range section.Keys {
			keys[key.Value] = key
		}
	}
	for _, char := range "Ǿɑɡɔàèìòùěǎǐǒǔǘǚǜ〔〕‖∣①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭■▲◆●×·〈〉［］﹑－―—～５" {
		if _, ok := keys[string(char)]; !ok {
			t.Errorf("missing exact key U+%04X", char)
		}
	}
	for _, mark := range "̣̩̃̆̌" {
		key, ok := keys[string(mark)]
		if !ok || key.Label != "◌"+string(mark) || key.Hint == "" {
			t.Errorf("combining U+%04X must insert only mark with dotted-circle label and hint", mark)
		}
	}
}
