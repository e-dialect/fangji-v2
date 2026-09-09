package main

import (
	"encoding/csv"
	"encoding/json"
	"github.com/pocketbase/pocketbase/core"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

func TestRareCharactersPersistThroughPocketBase(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	collection := &core.Collection{Name: "rare_character_roundtrip", Type: core.CollectionTypeBase, Fields: core.NewFieldsList(
		&core.TextField{Name: "ocr_text"},
		&core.TextField{Name: "proofread_row_json"},
	)}
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	const sample = "𢶀𠮷㙟𰻞䲠"
	row, err := json.Marshal(map[string]string{"内容": sample})
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("ocr_text", sample)
	record.Set("proofread_row_json", string(row))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.FindRecordById(collection.Id, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.GetString("ocr_text") != sample {
		t.Fatal("SQLite text round trip changed supplementary characters")
	}
	var decoded map[string]string
	if err := json.Unmarshal([]byte(loaded.GetString("proofread_row_json")), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["内容"] != sample {
		t.Fatal("structured row round trip changed supplementary characters")
	}
	var output strings.Builder
	writer := csv.NewWriter(&output)
	if err := writer.Write([]string{loaded.GetString("ocr_text")}); err != nil {
		t.Fatal(err)
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		t.Fatal(err)
	}
	cells, err := csv.NewReader(strings.NewReader(output.String())).Read()
	if err != nil || cells[0] != sample {
		t.Fatalf("CSV round trip failed: %v", err)
	}
}
