package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tokens"
)

func newExternalIdentityTestService(t *testing.T) (*externalIdentityService, *tests.TestApp) {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	users, err := app.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	if users.Schema.GetFieldByName("role") == nil {
		users.Schema.AddField(&schema.SchemaField{Name: "role", Type: schema.FieldTypeText})
	}
	if users.Schema.GetFieldByName("must_change_password") == nil {
		users.Schema.AddField(&schema.SchemaField{Name: "must_change_password", Type: schema.FieldTypeBool})
	}
	if err := app.Dao().SaveCollection(users); err != nil {
		t.Fatal(err)
	}

	mappings := &models.Collection{
		Name: "external_identity_mappings",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "user", Type: schema.FieldTypeText, Required: true},
			&schema.SchemaField{Name: "provider", Type: schema.FieldTypeText, Required: true},
			&schema.SchemaField{Name: "subject", Type: schema.FieldTypeText, Required: true},
		),
		Indexes: []string{
			"CREATE UNIQUE INDEX idx_test_external_subject ON external_identity_mappings (provider, subject)",
			"CREATE UNIQUE INDEX idx_test_external_user_provider ON external_identity_mappings (user, provider)",
		},
	}
	if err := app.Dao().SaveCollection(mappings); err != nil {
		t.Fatal(err)
	}
	memberships := &models.Collection{
		Name: "project_memberships",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "user", Type: schema.FieldTypeText, Required: true},
		),
	}
	if err := app.Dao().SaveCollection(memberships); err != nil {
		t.Fatal(err)
	}

	return newExternalIdentityService(app), app
}

func TestExternalIdentityCreatesOneStableLocalMapping(t *testing.T) {
	service, app := newExternalIdentityTestService(t)

	first, created, err := service.resolveOrCreateUser("mock", "remote-42")
	if err != nil {
		t.Fatal(err)
	}
	if !created {
		t.Fatal("first login should create a local account")
	}
	if first.GetString("role") != "user" || first.GetBool("must_change_password") {
		t.Fatalf("unexpected account defaults: role=%q must_change=%v", first.GetString("role"), first.GetBool("must_change_password"))
	}
	if first.Email() != "" || first.GetString("name") != "" {
		t.Fatalf("remote profile data must not be synthesized: email=%q name=%q", first.Email(), first.GetString("name"))
	}
	if first.PasswordHash() == "" || first.ValidatePassword("remote-password") {
		t.Fatal("external users must receive an independent random local password")
	}

	second, created, err := service.resolveOrCreateUser("mock", "remote-42")
	if err != nil {
		t.Fatal(err)
	}
	if created || second.Id != first.Id {
		t.Fatalf("repeated identity should reuse %q, got %q (created=%v)", first.Id, second.Id, created)
	}

	mappings, err := app.Dao().FindRecordsByFilter("external_identity_mappings", `provider = "mock"`, "created", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(mappings) != 1 || mappings[0].GetString("subject") != "remote-42" {
		t.Fatalf("unexpected mappings: %#v", mappings)
	}
	memberships, err := app.Dao().FindRecordsByFilter("project_memberships", `user = "`+first.Id+`"`, "created", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(memberships) != 0 {
		t.Fatal("external login must not grant project membership")
	}
}

func TestConcurrentExternalLoginsConvergeOnOneAccount(t *testing.T) {
	service, app := newExternalIdentityTestService(t)
	const workers = 6
	start := make(chan struct{})
	results := make(chan struct {
		id  string
		err error
	}, workers)
	var wait sync.WaitGroup
	for index := 0; index < workers; index++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			user, _, err := service.resolveOrCreateUser("mock", "concurrent-subject")
			id := ""
			if user != nil {
				id = user.Id
			}
			results <- struct {
				id  string
				err error
			}{id: id, err: err}
		}()
	}
	close(start)
	wait.Wait()
	close(results)

	userID := ""
	for result := range results {
		if result.err != nil {
			t.Fatalf("concurrent login failed: %v", result.err)
		}
		if userID == "" {
			userID = result.id
		}
		if result.id != userID {
			t.Fatalf("concurrent login mapped to %q and %q", userID, result.id)
		}
	}
	mappings, err := app.Dao().FindRecordsByFilter("external_identity_mappings", `subject = "concurrent-subject"`, "created", 10, 0)
	if err != nil || len(mappings) != 1 {
		t.Fatalf("concurrent mapping count=%d err=%v", len(mappings), err)
	}
}

func TestExternalIdentityBindingConflictsAndIdempotency(t *testing.T) {
	service, app := newExternalIdentityTestService(t)
	users, err := app.Dao().FindRecordsByFilter("users", `id != ""`, "created", 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) < 2 {
		t.Fatal("test fixture needs at least two users")
	}
	first, second := users[0], users[1]

	created, err := service.bindIdentity(first.Id, "mock", "subject-a")
	if err != nil || !created {
		t.Fatalf("initial bind: created=%v err=%v", created, err)
	}
	created, err = service.bindIdentity(first.Id, "mock", "subject-a")
	if err != nil || created {
		t.Fatalf("repeat bind should be idempotent: created=%v err=%v", created, err)
	}
	if _, err := service.bindIdentity(first.Id, "mock", "subject-b"); !errors.Is(err, errProviderBound) {
		t.Fatalf("expected one identity per user/provider, got %v", err)
	}
	if _, err := service.bindIdentity(second.Id, "mock", "subject-a"); !errors.Is(err, errIdentityOwned) {
		t.Fatalf("expected subject ownership conflict, got %v", err)
	}
}

func TestExternalAttemptLimiterUsesFixedWindow(t *testing.T) {
	limiter := newExternalAttemptLimiter(2, time.Minute)
	now := time.Unix(1000, 0)
	limiter.now = func() time.Time { return now }

	if !limiter.Allow("client") || !limiter.Allow("client") || limiter.Allow("client") {
		t.Fatal("limiter should allow only the configured attempts per window")
	}
	if !limiter.Allow("other-client") {
		t.Fatal("independent clients should not share a window")
	}
	now = now.Add(time.Minute)
	if !limiter.Allow("client") {
		t.Fatal("window should reset after its duration")
	}
}

func TestExternalAttemptLimiterBoundsClientEntries(t *testing.T) {
	limiter := newExternalAttemptLimiter(1, time.Hour)
	for index := 0; index <= externalAttemptMaxClients; index++ {
		if !limiter.Allow(string(rune(index + 1))) {
			t.Fatalf("first attempt for client %d was rejected", index)
		}
	}
	if len(limiter.entries) != externalAttemptMaxClients {
		t.Fatalf("limiter retained %d clients; want %d", len(limiter.entries), externalAttemptMaxClients)
	}
}

func TestTransportIPDoesNotTrustForwardedHeaders(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.RemoteAddr = "10.20.30.40:12345"
	request.Header.Set("X-Forwarded-For", "203.0.113.99")
	request.Header.Set("X-Real-IP", "198.51.100.20")
	if got := transportIP(request); got != "10.20.30.40" {
		t.Fatalf("transport IP trusted a spoofable forwarding header: %q", got)
	}
}

type mockExternalProvider struct {
	subject string
	err     error
}

func (p *mockExternalProvider) ID() string   { return "mock" }
func (p *mockExternalProvider) Name() string { return "模拟统一身份" }
func (p *mockExternalProvider) Authenticate(_ context.Context, _, _ string) (string, error) {
	return p.subject, p.err
}

func TestExternalLoginRouteUsesProviderMapping(t *testing.T) {
	_, app := newExternalIdentityTestService(t)
	provider := &mockExternalProvider{subject: "remote-99"}
	service := newExternalIdentityService(app, provider)
	service.register()

	e, err := apis.InitApi(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnBeforeServe().Trigger(&core.ServeEvent{App: app, Router: e}); err != nil {
		t.Fatal(err)
	}

	login := func() map[string]any {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api/fangji/auth/external/mock/login",
			strings.NewReader(`{"identity":"remote-name","password":"remote-secret"}`),
		)
		request.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		e.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("external login status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		if strings.Contains(recorder.Body.String(), "remote-name") || strings.Contains(recorder.Body.String(), "remote-secret") || strings.Contains(recorder.Body.String(), "remote-99") {
			t.Fatalf("external credentials or subject leaked in response: %s", recorder.Body.String())
		}
		var response map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if response["token"] == "" || response["meta"].(map[string]any)["provider"] != "mock" {
			t.Fatalf("unexpected auth response: %#v", response)
		}
		return response
	}

	first := login()
	second := login()
	firstRecord := first["record"].(map[string]any)
	secondRecord := second["record"].(map[string]any)
	if firstRecord["id"] != secondRecord["id"] {
		t.Fatalf("repeat login created a second account: %v vs %v", firstRecord["id"], secondRecord["id"])
	}
	if firstRecord["email"] != "" || firstRecord["name"] != "" {
		t.Fatalf("remote profile unexpectedly synchronized: %#v", firstRecord)
	}
}

func TestExternalLoginRouteRejectsBadProviderCredentials(t *testing.T) {
	_, app := newExternalIdentityTestService(t)
	service := newExternalIdentityService(app, &mockExternalProvider{err: errExternalCredentials})
	service.register()
	e, err := apis.InitApi(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnBeforeServe().Trigger(&core.ServeEvent{App: app, Router: e}); err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/fangji/auth/external/mock/login", strings.NewReader(`{"identity":"bad","password":"bad"}`))
	request.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	e.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestExternalProviderDiscoveryAndExplicitBindingRoutes(t *testing.T) {
	_, app := newExternalIdentityTestService(t)
	service := newExternalIdentityService(app, &mockExternalProvider{subject: "bind-subject"})
	service.register()
	e, err := apis.InitApi(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnBeforeServe().Trigger(&core.ServeEvent{App: app, Router: e}); err != nil {
		t.Fatal(err)
	}
	users, err := app.Dao().FindRecordsByFilter("users", `id != ""`, "created", 1, 0)
	if err != nil || len(users) != 1 {
		t.Fatalf("load test user: users=%d err=%v", len(users), err)
	}
	token, err := tokens.NewRecordAuthToken(app, users[0])
	if err != nil {
		t.Fatal(err)
	}

	request := func(method, path, authToken string, body string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		if authToken != "" {
			req.Header.Set("Authorization", authToken)
		}
		e.ServeHTTP(recorder, req)
		return recorder
	}

	guestProviders := request(http.MethodGet, "/api/fangji/auth/providers", "", "")
	if guestProviders.Code != http.StatusOK || !strings.Contains(guestProviders.Body.String(), `"bound":false`) {
		t.Fatalf("guest provider discovery: status=%d body=%s", guestProviders.Code, guestProviders.Body.String())
	}
	unauthorized := request(http.MethodPost, "/api/fangji/auth/external/mock/bind", "", `{"identity":"remote","password":"secret"}`)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated bind status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}
	bound := request(http.MethodPost, "/api/fangji/auth/external/mock/bind", token, `{"identity":"remote","password":"secret"}`)
	if bound.Code != http.StatusOK || !strings.Contains(bound.Body.String(), `"bound":true`) {
		t.Fatalf("authenticated bind: status=%d body=%s", bound.Code, bound.Body.String())
	}
	userProviders := request(http.MethodGet, "/api/fangji/auth/providers", token, "")
	if userProviders.Code != http.StatusOK || !strings.Contains(userProviders.Body.String(), `"bound":true`) {
		t.Fatalf("bound provider discovery: status=%d body=%s", userProviders.Code, userProviders.Body.String())
	}
}

func TestHinghwaIdentityProviderLoginContract(t *testing.T) {
	var received map[string]string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/django/login" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("unexpected content type %q", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Error(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"REMOTE-HS256-TOKEN","id":42}`))
	}))
	defer server.Close()

	provider, err := newHinghwaIdentityProviderWithClient(server.URL+"/django", server.Client(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	subject, err := provider.Authenticate(context.Background(), "hinghwa-user", "hinghwa-password")
	if err != nil {
		t.Fatal(err)
	}
	if subject != "42" {
		t.Fatalf("subject=%q; want 42", subject)
	}
	if received["username"] != "hinghwa-user" || received["password"] != "hinghwa-password" {
		t.Fatalf("unexpected upstream request: %#v", received)
	}
}

func TestHinghwaIdentityProviderSecurityBoundaries(t *testing.T) {
	if _, err := newHinghwaIdentityProvider("http://identity.example.test"); err == nil {
		t.Fatal("plain HTTP configuration must be rejected")
	}
	if _, err := newHinghwaIdentityProvider("https://user:secret@identity.example.test"); err == nil {
		t.Fatal("URL credentials must be rejected")
	}
	if _, err := newHinghwaIdentityProvider("https://identity.example.test?token=secret"); err == nil {
		t.Fatal("URL query credentials must be rejected")
	}

	var redirected atomic.Bool
	redirectServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/login" {
			http.Redirect(w, r, "/redirect-target", http.StatusFound)
			return
		}
		redirected.Store(true)
		_, _ = w.Write([]byte(`{"id":42}`))
	}))
	defer redirectServer.Close()
	provider, err := newHinghwaIdentityProviderWithClient(redirectServer.URL, redirectServer.Client(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Authenticate(context.Background(), "user", "password"); !errors.Is(err, errExternalUnavailable) {
		t.Fatalf("redirect should be rejected as unavailable, got %v", err)
	}
	if redirected.Load() {
		t.Fatal("provider followed an upstream redirect")
	}
}

func TestHinghwaIdentityProviderHandlesFailureResponses(t *testing.T) {
	tests := []struct {
		name     string
		status   int
		body     string
		expected error
	}{
		{name: "invalid credentials", status: http.StatusUnauthorized, body: `{}`, expected: errExternalCredentials},
		{name: "server error", status: http.StatusInternalServerError, body: `{}`, expected: errExternalUnavailable},
		{name: "malformed json", status: http.StatusOK, body: `{`, expected: errExternalUnavailable},
		{name: "missing subject", status: http.StatusOK, body: `{"token":"ignored"}`, expected: errExternalUnavailable},
		{name: "fractional subject", status: http.StatusOK, body: `{"id":4.2}`, expected: errExternalUnavailable},
		{name: "oversized response", status: http.StatusOK, body: strings.Repeat("x", hinghwaMaxResponseBytes+1), expected: errExternalUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()
			provider, err := newHinghwaIdentityProviderWithClient(server.URL, server.Client(), time.Second)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := provider.Authenticate(context.Background(), "user", "password"); !errors.Is(err, test.expected) {
				t.Fatalf("got %v; want %v", err, test.expected)
			}
		})
	}
}

func TestHinghwaIdentityProviderTimesOut(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(80 * time.Millisecond)
		_, _ = w.Write([]byte(`{"id":42}`))
	}))
	defer server.Close()
	provider, err := newHinghwaIdentityProviderWithClient(server.URL, server.Client(), 15*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Authenticate(context.Background(), "user", "password"); !errors.Is(err, errExternalUnavailable) {
		t.Fatalf("timeout should be reported as unavailable, got %v", err)
	}
}

func TestNormalizeHinghwaSubject(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want string
	}{
		{raw: `42`, want: "42"},
		{raw: `"stable-subject"`, want: "stable-subject"},
	} {
		got, err := normalizeHinghwaSubject(json.RawMessage(test.raw))
		if err != nil || got != test.want {
			t.Fatalf("normalize %s: got=%q err=%v", test.raw, got, err)
		}
	}
	for _, raw := range []string{"", "null", "-1", "1.2", `""`} {
		if got, err := normalizeHinghwaSubject(json.RawMessage(raw)); err == nil {
			t.Fatalf("normalize %q unexpectedly returned %q", raw, got)
		}
	}
}

func TestHinghwaResponseLimitIsEnforcedBeforeJSONParsing(t *testing.T) {
	body := append([]byte(`{"id":42,"padding":"`), bytes.Repeat([]byte("x"), hinghwaMaxResponseBytes)...)
	body = append(body, []byte(`"}`)...)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(body)
	}))
	defer server.Close()
	provider, err := newHinghwaIdentityProviderWithClient(server.URL, server.Client(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Authenticate(context.Background(), "user", "password"); !errors.Is(err, errExternalUnavailable) {
		t.Fatalf("oversized JSON should be rejected, got %v", err)
	}
}
