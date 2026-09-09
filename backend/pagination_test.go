package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func TestPaginationAndQueueIsolation(t *testing.T) {
	app := newSchemaTestApp(t)
	users, _ := app.FindCollectionByNameOrId("users")
	createUser := func(role string) *core.Record {
		user := core.NewRecord(users)
		user.Set("role", role)
		user.SetPassword("PaginationFixture123!")
		if err := app.Save(user); err != nil {
			t.Fatal(err)
		}
		return user
	}
	owner, reader, outsider := createUser("platform_admin"), createUser("user"), createUser("user")
	projects, _ := app.FindCollectionByNameOrId("projects")
	project := core.NewRecord(projects)
	project.Set("name", "Paging fixture")
	project.Set("admin", owner.Id)
	project.Set("required_proofreads", 2)
	project.Set("access_mode", "members_only")
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}
	memberships, _ := app.FindCollectionByNameOrId("project_memberships")
	member := core.NewRecord(memberships)
	member.Set("project", project.Id)
	member.Set("user", reader.Id)
	member.Set("role", "proofreader")
	member.Set("source", "assigned")
	member.Set("created_by", owner.Id)
	if err := app.Save(member); err != nil {
		t.Fatal(err)
	}
	if err := app.RunInTransaction(func(tx core.App) error {
		for i := 1; i <= 120; i++ {
			_, err := tx.DB().NewQuery(`INSERT INTO pages(id,project,page_number,pdf_page,status,ocr_text,proofread_round) VALUES ({:id},{:project},{:number},{:number},'pending',{:text},1)`).Bind(dbx.Params{"id": fmt.Sprintf("page%011d", i), "project": project.Id, "number": i, "text": fmt.Sprintf("item-%d", i)}).Execute()
			if err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	service := newImportService(app)
	service.registerPagination()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}); err != nil {
		t.Fatal(err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	request := func(path string, user *core.Record, status int) map[string]any {
		t.Helper()
		token, _ := user.NewAuthToken()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", token)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != status {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body.String())
		}
		result := map[string]any{}
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	path := "/api/fangji/projects/" + project.Id + "/pages"
	request(path, reader, 403)
	page := request(path+"?page=2&perPage=25", owner, 200)
	if page["totalItems"] != float64(120) || len(page["items"].([]any)) != 25 || page["items"].([]any)[0].(map[string]any)["page_number"] != float64(26) {
		t.Fatalf("bad page: %v", page)
	}
	filtered := request(path+"?minPage=30&maxPage=35&status=pending", owner, 200)
	if filtered["totalItems"] != float64(6) {
		t.Fatalf("range count: %v", filtered)
	}
	found := request(path+"?q=item-120", owner, 200)
	if found["totalItems"] != float64(1) {
		t.Fatalf("search count: %v", found)
	}
	request(path+"?minPage=invalid", owner, 400)
	literal := request(path+"?q=%25", owner, 200)
	if literal["totalItems"] != float64(0) {
		t.Fatal("search wildcard must be literal")
	}
	capped := request(path+"?perPage=10000", owner, 200)
	if len(capped["items"].([]any)) != 100 {
		t.Fatal("unbounded page size")
	}
	// Deleting the last page must clamp the next request to a valid page.
	if _, err := app.DB().NewQuery("DELETE FROM pages WHERE project={:project} AND page_number>100").Bind(dbx.Params{"project": project.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	clamped := request(path+"?page=5&perPage=25", owner, 200)
	if clamped["page"] != float64(4) || clamped["totalItems"] != float64(100) {
		t.Fatalf("clamp failed: %v", clamped)
	}
	hidden := request("/api/fangji/proofreading-queues", outsider, 200)
	if hidden["totalItems"] != float64(0) {
		t.Fatal("unrelated projects leaked")
	}
	queues := request("/api/fangji/proofreading-queues?perPage=1", reader, 200)
	row := queues["items"].([]any)[0].(map[string]any)
	if row["claimable"] != float64(100) || row["nextPage"].(map[string]any)["page_number"] != float64(1) {
		t.Fatalf("queue: %v", row)
	}
	// A previous submission prevents this user from claiming that same round.
	if _, err := app.DB().NewQuery(`INSERT INTO proofreading_attempts(id,page,project,proofreader,round,kind,pass_no) VALUES ('attempt00000001','page00000000001',{:project},{:user},1,'proofread',1)`).Bind(dbx.Params{"project": project.Id, "user": reader.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	queues = request("/api/fangji/proofreading-queues", reader, 200)
	row = queues["items"].([]any)[0].(map[string]any)
	if row["claimable"] != float64(99) || row["nextPage"].(map[string]any)["page_number"] != float64(2) {
		t.Fatalf("repeat claim exposed: %v", row)
	}
	// An active lease owned by another user is unavailable until expiration.
	if _, err := app.DB().NewQuery(`UPDATE pages SET status='claimed',proofreader={:user} WHERE id='page00000000002'`).Bind(dbx.Params{"user": outsider.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.DB().NewQuery(`INSERT INTO task_leases(id,page,project,holder,expires_at) VALUES ('lease0000000001','page00000000002',{:project},{:user},{:expires})`).Bind(dbx.Params{"project": project.Id, "user": outsider.Id, "expires": time.Now().UTC().Add(time.Hour).Format("2006-01-02 15:04:05.000Z")}).Execute(); err != nil {
		t.Fatal(err)
	}
	queues = request("/api/fangji/proofreading-queues", reader, 200)
	row = queues["items"].([]any)[0].(map[string]any)
	if row["claimable"] != float64(98) {
		t.Fatalf("active other lease claimable: %v", row)
	}
	if _, err := app.DB().NewQuery(`UPDATE task_leases SET expires_at='2020-01-01 00:00:00.000Z'`).Execute(); err != nil {
		t.Fatal(err)
	}
	queues = request("/api/fangji/proofreading-queues", reader, 200)
	row = queues["items"].([]any)[0].(map[string]any)
	if row["claimable"] != float64(99) {
		t.Fatalf("expired lease not claimable: %v", row)
	}
}

func BenchmarkQueueAggregation(b *testing.B) {
	app := newSchemaTestApp(b)
	const projectID = "benchproject001"
	const userID = "benchreader0001"
	if err := app.RunInTransaction(func(tx core.App) error {
		for _, sql := range []string{
			`INSERT INTO projects(id,name,admin,required_proofreads) VALUES ('benchproject001','benchmark','benchowner00001',2)`,
			`INSERT INTO project_memberships(id,project,user,role) VALUES ('benchmember0001','benchproject001','benchreader0001','proofreader')`,
			`CREATE INDEX IF NOT EXISTS idx_attempts_page_round_kind_user ON proofreading_attempts(page,round,kind,proofreader)`,
			`CREATE INDEX IF NOT EXISTS idx_membership_user_role_project ON project_memberships(user,role,project)`,
			`CREATE INDEX IF NOT EXISTS idx_pages_project_status_order ON pages(project,status,page_number,id)`,
		} {
			if _, err := tx.DB().NewQuery(sql).Execute(); err != nil {
				return err
			}
		}
		for i := 1; i <= 10000; i++ {
			_, err := tx.DB().NewQuery(`INSERT INTO pages(id,project,page_number,pdf_page,status,ocr_text,proofread_round) VALUES ({:id},{:project},{:number},{:number},'pending',{:text},1)`).Bind(dbx.Params{"id": fmt.Sprintf("bench%010d", i), "project": projectID, "number": i, "text": strings.Repeat("文本ɑ𢶀", 100)}).Execute()
			if err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		b.Fatal(err)
	}
	params := dbx.Params{"user": userID, "now": "2026-09-09 00:00:00.000Z"}
	b.Run("old_record_scan", func(b *testing.B) {
		b.ReportAllocs()
		for n := 0; n < b.N; n++ {
			pages, err := app.FindRecordsByFilter("pages", "project={:project}", "page_number", 100000, 0, dbx.Params{"project": projectID})
			if err != nil {
				b.Fatal(err)
			}
			for _, page := range pages {
				if _, err := app.FindRecordsByFilter("proofreading_attempts", "page={:page} && round=1 && kind='proofread'", "pass_no,created", 1000, 0, dbx.Params{"page": page.Id}); err != nil {
					b.Fatal(err)
				}
			}
		}
	})
	b.Run("new_two_aggregates", func(b *testing.B) {
		b.ReportAllocs()
		for n := 0; n < b.N; n++ {
			for i := 0; i < 2; i++ {
				var count int
				if err := app.DB().NewQuery(queueCTE + "SELECT SUM(claimable) FROM queues").Bind(params).Row(&count); err != nil {
					b.Fatal(err)
				}
				if count != 10000 {
					b.Fatal(count)
				}
			}
		}
	})
	plan := []struct {
		Detail string `db:"detail"`
	}{}
	if err := app.DB().NewQuery("EXPLAIN QUERY PLAN " + queueCTE + "SELECT * FROM queues").Bind(params).All(&plan); err != nil {
		b.Fatal(err)
	}
	text := ""
	for _, row := range plan {
		text += row.Detail + "\n"
	}
	for _, index := range []string{"idx_attempts_page_round_kind_user", "idx_membership_user_role_project"} {
		if !strings.Contains(text, index) {
			b.Fatalf("index missing: %s\n%s", index, text)
		}
	}
	b.Log(text)
}
