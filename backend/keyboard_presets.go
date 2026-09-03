package main

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

const defaultKeyboardID = "hinghwa-dialect"

//go:embed keyboards/*.json
var embeddedKeyboardFiles embed.FS

var keyboardIDPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{1,63}$`)

type keyboardDefinition struct {
	SchemaVersion int               `json:"schemaVersion"`
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Sections      []keyboardSection `json:"sections"`
}

type keyboardSection struct {
	ID          string        `json:"id"`
	Label       string        `json:"label"`
	DefaultOpen bool          `json:"defaultOpen"`
	Keys        []keyboardKey `json:"keys"`
}

type keyboardKey struct {
	Value string `json:"value"`
	Label string `json:"label,omitempty"`
	Hint  string `json:"hint,omitempty"`
}

type keyboardPreset struct {
	Definition keyboardDefinition
	JSON       string
	Hash       string
}

func registerKeyboardPresets(app *pocketbase.PocketBase) error {
	presets, err := loadKeyboardPresets(embeddedKeyboardFiles)
	if err != nil {
		return fmt.Errorf("validate embedded keyboard presets: %w", err)
	}
	if _, ok := presets[defaultKeyboardID]; !ok {
		return fmt.Errorf("default keyboard %q is not embedded", defaultKeyboardID)
	}

	app.OnAfterBootstrap().Add(func(_ *core.BootstrapEvent) error {
		if err := syncKeyboardPresets(app, presets); err != nil {
			return fmt.Errorf("sync embedded keyboard presets: %w", err)
		}
		return nil
	})
	return nil
}

func loadKeyboardPresets(source fs.FS) (map[string]keyboardPreset, error) {
	paths, err := fs.Glob(source, "keyboards/*.json")
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, errors.New("no keyboard definitions found")
	}
	sort.Strings(paths)
	presets := make(map[string]keyboardPreset, len(paths))
	for _, path := range paths {
		raw, err := fs.ReadFile(source, path)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		definition, canonical, err := decodeKeyboardDefinition(raw)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		if _, exists := presets[definition.ID]; exists {
			return nil, fmt.Errorf("%s: duplicate keyboard id %q", path, definition.ID)
		}
		digest := sha256.Sum256(canonical)
		presets[definition.ID] = keyboardPreset{
			Definition: definition,
			JSON:       string(canonical),
			Hash:       hex.EncodeToString(digest[:]),
		}
	}
	return presets, nil
}

func decodeKeyboardDefinition(raw []byte) (keyboardDefinition, []byte, error) {
	var definition keyboardDefinition
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&definition); err != nil {
		return definition, nil, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			err = errors.New("multiple JSON values are not allowed")
		}
		return definition, nil, err
	}
	if err := validateKeyboardDefinition(definition); err != nil {
		return definition, nil, err
	}
	canonical, err := json.Marshal(definition)
	if err != nil {
		return definition, nil, err
	}
	return definition, canonical, nil
}

func validateKeyboardDefinition(definition keyboardDefinition) error {
	if definition.SchemaVersion != 1 {
		return fmt.Errorf("unsupported schemaVersion %d", definition.SchemaVersion)
	}
	if !keyboardIDPattern.MatchString(definition.ID) {
		return errors.New("id must match ^[a-z][a-z0-9-]{1,63}$")
	}
	if strings.TrimSpace(definition.Name) == "" || utf8.RuneCountInString(definition.Name) > 100 {
		return errors.New("name must contain 1 to 100 characters")
	}
	if utf8.RuneCountInString(definition.Description) > 500 {
		return errors.New("description cannot exceed 500 characters")
	}
	if len(definition.Sections) == 0 || len(definition.Sections) > 30 {
		return errors.New("sections must contain 1 to 30 items")
	}
	sectionIDs := make(map[string]struct{}, len(definition.Sections))
	totalKeys := 0
	for sectionIndex, section := range definition.Sections {
		if !keyboardIDPattern.MatchString(section.ID) {
			return fmt.Errorf("sections[%d].id is invalid", sectionIndex)
		}
		if _, exists := sectionIDs[section.ID]; exists {
			return fmt.Errorf("sections[%d].id %q is duplicated", sectionIndex, section.ID)
		}
		sectionIDs[section.ID] = struct{}{}
		if strings.TrimSpace(section.Label) == "" || utf8.RuneCountInString(section.Label) > 100 {
			return fmt.Errorf("sections[%d].label must contain 1 to 100 characters", sectionIndex)
		}
		if len(section.Keys) == 0 || len(section.Keys) > 200 {
			return fmt.Errorf("sections[%d].keys must contain 1 to 200 items", sectionIndex)
		}
		totalKeys += len(section.Keys)
		for keyIndex, key := range section.Keys {
			if key.Value == "" || utf8.RuneCountInString(key.Value) > 32 {
				return fmt.Errorf("sections[%d].keys[%d].value must contain 1 to 32 characters", sectionIndex, keyIndex)
			}
			if utf8.RuneCountInString(key.Label) > 64 || utf8.RuneCountInString(key.Hint) > 200 {
				return fmt.Errorf("sections[%d].keys[%d] label or hint is too long", sectionIndex, keyIndex)
			}
		}
	}
	if totalKeys > 1000 {
		return errors.New("keyboard cannot contain more than 1000 keys")
	}
	return nil
}

func syncKeyboardPresets(app *pocketbase.PocketBase, presets map[string]keyboardPreset) error {
	dao := app.Dao()
	collection, err := dao.FindCollectionByNameOrId("keyboards")
	if err != nil {
		// Numeric migrations run in separate processes. Earlier migration steps do
		// not yet have the keyboard collections, so validation succeeds and sync
		// is deferred until the first process that sees migration 21.
		return nil
	}
	existing, err := dao.FindRecordsByFilter("keyboards", `id != ""`, "created", 1000000, 0)
	if err != nil {
		return err
	}
	byID := make(map[string]*models.Record, len(existing))
	for _, record := range existing {
		if record.GetString("origin") == "preset" {
			byID[record.GetString("keyboard_id")] = record
		}
	}

	ids := make([]string, 0, len(presets))
	for id := range presets {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		preset := presets[id]
		record := byID[id]
		if record == nil {
			record = models.NewRecord(collection)
		}
		record.Set("keyboard_id", preset.Definition.ID)
		record.Set("schema_version", preset.Definition.SchemaVersion)
		record.Set("name", preset.Definition.Name)
		record.Set("description", preset.Definition.Description)
		record.Set("definition_json", preset.JSON)
		record.Set("origin", "preset")
		record.Set("active", true)
		record.Set("source_hash", preset.Hash)
		if err := dao.SaveRecord(record); err != nil {
			return err
		}
		delete(byID, id)
	}
	for _, stale := range byID {
		stale.Set("active", false)
		if err := dao.SaveRecord(stale); err != nil {
			return err
		}
	}

	if err := enableDefaultKeyboardForExistingProjects(app, defaultKeyboardID); err != nil {
		return err
	}
	log.Printf("Synchronized %d embedded keyboard preset(s)", len(presets))
	return nil
}

func enableDefaultKeyboardForExistingProjects(app *pocketbase.PocketBase, keyboardID string) error {
	dao := app.Dao()
	keyboards, err := dao.FindRecordsByFilter("keyboards", fmt.Sprintf(`keyboard_id = %q && active = true`, keyboardID), "", 1, 0)
	if err != nil || len(keyboards) == 0 {
		return fmt.Errorf("active default keyboard %q was not found", keyboardID)
	}
	projects, err := dao.FindRecordsByFilter("projects", `id != ""`, "created", 1000000, 0)
	if err != nil {
		return err
	}
	links, err := dao.FindRecordsByFilter("project_keyboards", `id != ""`, "created", 1000000, 0)
	if err != nil {
		return err
	}
	linked := make(map[string]struct{}, len(links))
	for _, link := range links {
		if link.GetString("keyboard") == keyboards[0].Id {
			linked[link.GetString("project")] = struct{}{}
		}
	}
	linkCollection, err := dao.FindCollectionByNameOrId("project_keyboards")
	if err != nil {
		return err
	}
	for _, project := range projects {
		if _, exists := linked[project.Id]; exists {
			continue
		}
		link := models.NewRecord(linkCollection)
		link.Set("project", project.Id)
		link.Set("keyboard", keyboards[0].Id)
		link.Set("enabled", true)
		link.Set("is_default", true)
		link.Set("sort_order", 0)
		if err := dao.SaveRecord(link); err != nil {
			return err
		}
	}
	return nil
}
