package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

func TestProjectAccessMigrationRollbackRestoresLegacyRules(t *testing.T) {
	const projectAccessMigrationNumber = 20

	migrationsDir, err := filepath.Abs("pb_migrations")
	if err != nil {
		t.Fatal(err)
	}

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("create test app: %v", err)
	}
	defer app.Cleanup()
	tempDir := t.TempDir()
	emptyHooksDir := filepath.Join(tempDir, "empty_hooks")
	if err := os.MkdirAll(emptyHooksDir, 0o755); err != nil {
		t.Fatalf("create empty hooks directory: %v", err)
	}

	projectMigrations := loadProjectMigrations(t, app, migrationsDir, emptyHooksDir)
	applyProjectMigrationsThrough(t, app, projectMigrations, projectAccessMigrationNumber)
	secrets, err := app.Dao().FindCollectionByNameOrId("project_access_secrets")
	if err != nil {
		t.Fatalf("find project_access_secrets: %v", err)
	}
	if secrets.Type != models.CollectionTypeAuth {
		t.Fatalf("project_access_secrets type = %q, want auth", secrets.Type)
	}
	if secrets.Schema.GetFieldByName("salt") != nil || secrets.Schema.GetFieldByName("password_hash") != nil {
		t.Fatal("project secrets must not expose fast-hash storage fields")
	}
	if _, err := app.Dao().FindCollectionByNameOrId("project_join_attempts"); err != nil {
		t.Fatalf("find project_join_attempts: %v", err)
	}
	joinSourceAttempts, err := app.Dao().FindCollectionByNameOrId("project_join_source_attempts")
	if err != nil {
		t.Fatalf("find project_join_source_attempts: %v", err)
	}
	if field := joinSourceAttempts.Schema.GetFieldByName("source_key"); field == nil {
		t.Fatal("project_join_source_attempts.source_key is missing")
	}

	users, err := app.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users: %v", err)
	}
	owner := models.NewRecord(users)
	_ = owner.SetUsername("migration-test-owner")
	_ = owner.SetEmail("migration-test-owner@example.com")
	_ = owner.SetPassword("MigrationOwner123!")
	owner.Set("role", "platform_admin")
	if err := app.Dao().SaveRecord(owner); err != nil {
		t.Fatalf("save test owner: %v", err)
	}
	projects, err := app.Dao().FindCollectionByNameOrId("projects")
	if err != nil {
		t.Fatalf("find projects: %v", err)
	}
	project := models.NewRecord(projects)
	project.Set("name", "Migration password test")
	project.Set("admin", owner.Id)
	project.Set("access_mode", "password")
	if err := app.Dao().SaveRecord(project); err != nil {
		t.Fatalf("save test project: %v", err)
	}
	secret := models.NewRecord(secrets)
	_ = secret.SetUsername("project_" + project.Id)
	secret.Set("project", project.Id)
	if err := secret.SetPassword("SlowProjectPassword123!"); err != nil {
		t.Fatalf("hash project password: %v", err)
	}
	if err := app.Dao().SaveRecord(secret); err != nil {
		t.Fatalf("save project secret: %v", err)
	}
	savedSecret, err := app.Dao().FindRecordById("project_access_secrets", secret.Id)
	if err != nil {
		t.Fatalf("reload project secret: %v", err)
	}
	if !strings.HasPrefix(savedSecret.PasswordHash(), "$2a$12$") {
		t.Fatalf("project secret is not stored with bcrypt cost 12: %q", savedSecret.PasswordHash())
	}
	if !savedSecret.ValidatePassword("SlowProjectPassword123!") || savedSecret.ValidatePassword("wrong") {
		t.Fatal("project secret bcrypt validation returned an unexpected result")
	}

	projectAccessMigration := findProjectMigration(t, projectMigrations, "20_project_access.js")
	if err := app.DB().Transactional(func(tx *dbx.Tx) error {
		return projectAccessMigration.Down(tx)
	}); err != nil {
		t.Fatalf("rollback project access migration: %v", err)
	}

	assertCollectionRules(t, app, "project_files", collectionRules{
		list:   `@request.auth.id != ""`,
		view:   `@request.auth.id != ""`,
		create: `@request.auth.role = "admin"`,
		update: `@request.auth.role = "admin"`,
		delete: `@request.auth.role = "admin"`,
	})
	legacyPageReadRule := `@request.auth.id != "" && ( @request.auth.role = "admin" || (@request.auth.role = "proofreader" && status != "importing") )`
	assertCollectionRules(t, app, "pages", collectionRules{
		list:   legacyPageReadRule,
		view:   legacyPageReadRule,
		create: `@request.auth.role = "admin"`,
		update: `@request.auth.role = "admin"`,
		delete: `@request.auth.role = "admin"`,
	})
	assertCollectionRules(t, app, "proofreading_attempts", collectionRules{
		list: `@request.auth.role = "admin" || proofreader = @request.auth.id`,
		view: `@request.auth.role = "admin" || proofreader = @request.auth.id`,
	})
	assertCollectionRules(t, app, "import_jobs", collectionRules{
		list:   `@request.auth.role = "admin"`,
		view:   `@request.auth.role = "admin"`,
		delete: `@request.auth.role = "admin"`,
	})
	assertCollectionRules(t, app, "import_job_errors", collectionRules{
		list: `@request.auth.role = "admin"`,
		view: `@request.auth.role = "admin"`,
	})

	for _, name := range []string{"project_join_source_attempts", "project_join_attempts", "project_access_secrets", "project_creator_grants", "project_memberships", "project_acls"} {
		if _, err := app.Dao().FindCollectionByNameOrId(name); err == nil {
			t.Fatalf("collection %q still exists after rollback", name)
		}
	}
}

func TestProjectJoinAttemptRetentionMigrationIndexes(t *testing.T) {
	const retentionMigrationNumber = 26

	migrationsDir, err := filepath.Abs("pb_migrations")
	if err != nil {
		t.Fatal(err)
	}
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("create test app: %v", err)
	}
	defer app.Cleanup()
	emptyHooksDir := filepath.Join(t.TempDir(), "empty_hooks")
	if err := os.MkdirAll(emptyHooksDir, 0o755); err != nil {
		t.Fatalf("create empty hooks directory: %v", err)
	}

	projectMigrations := loadProjectMigrations(t, app, migrationsDir, emptyHooksDir)
	applyProjectMigrationsThrough(t, app, projectMigrations, retentionMigrationNumber)
	indexes := map[string]string{
		"project_join_attempts":        "idx_project_join_attempt_window",
		"project_join_source_attempts": "idx_project_join_source_attempt_window",
	}
	for collectionName, indexName := range indexes {
		assertCollectionHasIndex(t, app, collectionName, indexName, true)
	}

	retentionMigration := findProjectMigration(t, projectMigrations, "26_project_join_attempt_retention.js")
	if err := app.DB().Transactional(func(tx *dbx.Tx) error {
		return retentionMigration.Down(tx)
	}); err != nil {
		t.Fatalf("rollback project join attempt retention migration: %v", err)
	}
	for collectionName, indexName := range indexes {
		assertCollectionHasIndex(t, app, collectionName, indexName, false)
	}
}

func loadProjectMigrations(t *testing.T, app core.App, migrationsDir, hooksDir string) []*migrate.Migration {
	t.Helper()
	jsvm.MustRegister(app, jsvm.Config{
		HooksDir:      hooksDir,
		MigrationsDir: migrationsDir,
		TypesDir:      filepath.Join(t.TempDir(), "types"),
	})

	byName := map[string]*migrate.Migration{}
	for _, migration := range migrations.AppMigrations.Items() {
		if strings.HasSuffix(migration.File, ".js") {
			byName[migration.File] = migration
		}
	}
	result := make([]*migrate.Migration, 0, len(byName))
	for _, migration := range byName {
		result = append(result, migration)
	}
	sort.Slice(result, func(i, j int) bool {
		return migrationNumber(result[i].File) < migrationNumber(result[j].File)
	})
	return result
}

func applyProjectMigrationsThrough(t *testing.T, app core.App, projectMigrations []*migrate.Migration, maximum int) {
	t.Helper()
	for index, migration := range projectMigrations {
		if migrationNumber(migration.File) > maximum {
			continue
		}
		applyProjectMigration(t, app, migration, index)
	}
}

func applyProjectMigration(t *testing.T, app core.App, migration *migrate.Migration, order int) {
	t.Helper()
	err := app.DB().Transactional(func(tx *dbx.Tx) error {
		if migration.Up != nil {
			if err := migration.Up(tx); err != nil {
				return fmt.Errorf("apply %s: %w", migration.File, err)
			}
		}
		_, err := tx.Insert(migrate.DefaultMigrationsTable, dbx.Params{
			"file":    migration.File,
			"applied": time.Now().UnixMicro() + int64(order),
		}).Execute()
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func findProjectMigration(t *testing.T, projectMigrations []*migrate.Migration, filename string) *migrate.Migration {
	t.Helper()
	for _, migration := range projectMigrations {
		if migration.File == filename {
			return migration
		}
	}
	t.Fatalf("project migration %q was not registered", filename)
	return nil
}

func migrationNumber(name string) int {
	prefix := strings.SplitN(name, "_", 2)[0]
	number, err := strconv.Atoi(prefix)
	if err != nil {
		return int(^uint(0) >> 1)
	}
	return number
}

type collectionRules struct {
	list   string
	view   string
	create string
	update string
	delete string
}

func assertCollectionRules(t *testing.T, app core.App, name string, want collectionRules) {
	t.Helper()
	collection, err := app.Dao().FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatalf("find collection %q: %v", name, err)
	}
	assertRule := func(label string, got *string, expected string) {
		t.Helper()
		if expected == "" {
			if got != nil {
				t.Fatalf("%s.%s = %q, want nil", name, label, *got)
			}
			return
		}
		if got == nil || *got != expected {
			value := "<nil>"
			if got != nil {
				value = *got
			}
			t.Fatalf("%s.%s = %q, want %q", name, label, value, expected)
		}
	}
	assertRule("listRule", collection.ListRule, want.list)
	assertRule("viewRule", collection.ViewRule, want.view)
	assertRule("createRule", collection.CreateRule, want.create)
	assertRule("updateRule", collection.UpdateRule, want.update)
	assertRule("deleteRule", collection.DeleteRule, want.delete)
}

func assertCollectionHasIndex(t *testing.T, app core.App, collectionName, indexName string, expected bool) {
	t.Helper()
	collection, err := app.Dao().FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("find collection %q: %v", collectionName, err)
	}
	found := false
	for _, index := range collection.Indexes {
		if strings.Contains(index, indexName) {
			found = true
			break
		}
	}
	if found != expected {
		t.Fatalf("collection %q index %q presence = %t, want %t", collectionName, indexName, found, expected)
	}
}
