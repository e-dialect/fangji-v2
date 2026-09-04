package main

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

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

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatalf("read migrations: %v", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return migrationNumber(entries[i].Name()) < migrationNumber(entries[j].Name())
	})
	for index, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".js") {
			continue
		}
		if migrationNumber(entry.Name()) > projectAccessMigrationNumber {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(migrationsDir, entry.Name()))
		if err != nil {
			t.Fatalf("read migration %s: %v", entry.Name(), err)
		}
		isolatedDir := filepath.Join(tempDir, "ordered_migrations", strconv.Itoa(index))
		if err := os.MkdirAll(isolatedDir, 0o755); err != nil {
			t.Fatalf("create ordered migration directory: %v", err)
		}
		if err := os.WriteFile(filepath.Join(isolatedDir, entry.Name()), raw, 0o644); err != nil {
			t.Fatalf("copy migration %s: %v", entry.Name(), err)
		}
		jsvm.MustRegister(app, jsvm.Config{
			HooksDir:      emptyHooksDir,
			MigrationsDir: isolatedDir,
			TypesDir:      filepath.Join(tempDir, "types"),
		})
		orderedRunner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
		if err != nil {
			t.Fatalf("create migration runner for %s: %v", entry.Name(), err)
		}
		if _, err := orderedRunner.Up(); err != nil {
			t.Fatalf("apply migration %s in numeric order: %v", entry.Name(), err)
		}
	}

	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("create migration runner: %v", err)
	}
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

	if _, err := runner.Down(1); err != nil {
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

	for _, name := range []string{"project_join_attempts", "project_access_secrets", "project_creator_grants", "project_memberships", "project_acls"} {
		if _, err := app.Dao().FindCollectionByNameOrId(name); err == nil {
			t.Fatalf("collection %q still exists after rollback", name)
		}
	}
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
