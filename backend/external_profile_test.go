package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type profileFixture struct {
	profile externalProfile
	avatar  *filesystem.File
}

func (p *profileFixture) ID() string   { return "fixture" }
func (p *profileFixture) Name() string { return "Fixture" }
func (p *profileFixture) Authenticate(context.Context, string, string) (string, error) {
	return "42", nil
}
func (p *profileFixture) Profile(context.Context, string) externalProfile { return p.profile }
func (p *profileFixture) Avatar(context.Context, string) *filesystem.File { return p.avatar }
func profilePNG(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	im := image.NewRGBA(image.Rect(0, 0, 2, 2))
	im.Set(0, 0, color.RGBA{R: 200, A: 255})
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestExternalProfileBackfillsExistingAccountAndPreservesEdits(t *testing.T) {
	s, app := newExternalIdentityTestService(t)
	user, _, err := s.resolveOrCreateUser("fixture", "42")
	if err != nil {
		t.Fatal(err)
	}
	f, err := filesystem.NewFileFromBytes(profilePNG(t), "fixture.png")
	if err != nil {
		t.Fatal(err)
	}
	p := &profileFixture{externalProfile{"远端昵称", "remote@example.com", "https://cos.edialect.top/avatar.png"}, f}
	got := s.syncExternalProfile(context.Background(), p, "42", user)
	if got.Id != user.Id || got.GetString("name") != "远端昵称" || got.Email() != "remote@example.com" || got.Verified() || got.GetString("avatar") == "" || got.GetString("role") != "user" {
		t.Fatalf("unexpected profile: %s", got.PublicExport())
	}
	fs, err := app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	reader, err := fs.GetReader(got.BaseFilesPath() + "/" + got.GetString("avatar"))
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := io.ReadAll(reader)
	reader.Close()
	if !bytes.Equal(stored, profilePNG(t)) {
		t.Fatal("avatar bytes not saved locally")
	}
	got.Set("name", "本地昵称")
	got.SetEmail("local@example.com")
	got.SetVerified(true)
	if err := app.Save(got); err != nil {
		t.Fatal(err)
	}
	// Pass an old session snapshot; transaction must preserve the newer local edits.
	again := s.syncExternalProfile(context.Background(), p, "42", user)
	if again.GetString("name") != "本地昵称" || again.Email() != "local@example.com" || !again.Verified() {
		t.Fatal("overwrote local edit")
	}
}
func TestExternalProfileDuplicateEmailDoesNotBlockOtherFields(t *testing.T) {
	s, app := newExternalIdentityTestService(t)
	other, _, _ := s.resolveOrCreateUser("fixture", "other")
	other.SetEmail("taken@example.com")
	if err := app.Save(other); err != nil {
		t.Fatal(err)
	}
	user, _, _ := s.resolveOrCreateUser("fixture", "42")
	for _, email := range []string{"taken@example.com", "not-an-email"} {
		got := s.syncExternalProfile(context.Background(), &profileFixture{profile: externalProfile{Name: "available", Email: email}}, "42", user)
		if got.Id != user.Id || got.GetString("name") != "available" || got.Email() != "" {
			t.Fatal("email conflict prevented independent profile sync or merged accounts")
		}
	}
}
func TestExternalLoginReturnsSyncedProfileAndUsableToken(t *testing.T) {
	_, app := newExternalIdentityTestService(t)
	p := &profileFixture{profile: externalProfile{Name: "Login name", Email: "login@example.com"}}
	s := newExternalIdentityService(app, p)
	s.register()
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
	req := httptest.NewRequest("POST", "/api/fangji/auth/external/fixture/login", strings.NewReader(`{"identity":"test","password":"password"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("login %d: %s", rec.Code, rec.Body.String())
	}
	var data struct {
		Token  string `json:"token"`
		Record struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Verified bool   `json:"verified"`
		} `json:"record"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if data.Record.Name != "Login name" || data.Record.Email != "login@example.com" || data.Record.Verified {
		t.Fatalf("wrong auth profile: %+v", data.Record)
	}
	req = httptest.NewRequest("POST", "/api/collections/users/auth-refresh", nil)
	req.Header.Set("Authorization", data.Token)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("synced token invalid: %d %s", rec.Code, rec.Body.String())
	}
}

type avatarRoundTrip func(*http.Request) (*http.Response, error)

func (f avatarRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestHinghwaAvatarFetchIsBoundedAndRejectsUnsafeTargets(t *testing.T) {
	data := profilePNG(t)
	calls := 0
	client := &http.Client{Transport: avatarRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "" || r.Header.Get("token") != "" {
			t.Fatal("forwarded credentials")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(data)), Header: make(http.Header)}, nil
	})}
	p, err := newHinghwaIdentityProviderWithClient("https://identity.example", client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	for _, u := range []string{"http://cos.edialect.top/a", "https://127.0.0.1/a", "https://cos.edialect.top.evil.test/a", "https://cos.edialect.top:8443/a", "https://user@cos.edialect.top/a", "file:///etc/passwd"} {
		if p.Avatar(context.Background(), u) != nil {
			t.Fatal("unsafe target accepted")
		}
	}
	if calls != 0 {
		t.Fatal("unsafe URL triggered request")
	}
	if p.Avatar(context.Background(), "https://cos.edialect.top/a.png") == nil {
		t.Fatal("valid image rejected")
	}
	data = []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	if p.Avatar(context.Background(), "https://cos.edialect.top/a.svg") != nil {
		t.Fatal("active format accepted")
	}
	data = make([]byte, 2*1024*1024+1)
	if p.Avatar(context.Background(), "https://cos.edialect.top/a.png") != nil {
		t.Fatal("oversized body accepted")
	}
}
func TestHinghwaProfileChecksSubjectAndExtractsAvailableFields(t *testing.T) {
	body := `{"user":{"id":42,"nickname":"name","email":"hello@example.com","avatar":"https://cos.edialect.top/a.png","is_admin":true}}`
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, body)
	}))
	defer server.Close()
	p, _ := newHinghwaIdentityProviderWithClient(server.URL, server.Client(), time.Second)
	got := p.Profile(context.Background(), "42")
	if got.Name != "name" || got.Email != "hello@example.com" || got.AvatarURL != "https://cos.edialect.top/a.png" {
		t.Fatalf("missing fields: %+v", got)
	}
	if p.Profile(context.Background(), "43") != (externalProfile{}) {
		t.Fatal("wrong identity profile accepted")
	}
	body = `{"user":{"id":42,"nickname":""}}`
	if p.Profile(context.Background(), "42") != (externalProfile{}) {
		t.Fatal("empty fields invented")
	}
}

func TestExternalBindingReturnsRefreshedLocalProfile(t *testing.T) {
	old, app := newExternalIdentityTestService(t)
	user, _, _ := old.resolveOrCreateUser("local", "binding")
	token, _ := user.NewAuthToken()
	p := &profileFixture{profile: externalProfile{Name: "Bound name", Email: "bound@example.com"}}
	s := newExternalIdentityService(app, p)
	s.register()
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
	request := httptest.NewRequest("POST", "/api/fangji/auth/external/fixture/bind", strings.NewReader(`{"identity":"fixture","password":"password"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("bind %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Token  string `json:"token"`
		Record struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"record"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Record.ID != user.Id || result.Record.Email != "bound@example.com" || result.Record.Name != "Bound name" || result.Token == "" {
		t.Fatalf("wrong binding profile: %+v", result.Record)
	}
	request = httptest.NewRequest("POST", "/api/collections/users/auth-refresh", nil)
	request.Header.Set("Authorization", result.Token)
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("bind token invalid: %d", response.Code)
	}
}

func TestHinghwaAvatarDoesNotFollowRedirect(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: avatarRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://127.0.0.1/private"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	p, _ := newHinghwaIdentityProviderWithClient("https://identity.example", client, time.Second)
	if p.Avatar(context.Background(), "https://cos.edialect.top/a.png") != nil || calls != 1 {
		t.Fatal("avatar followed redirect")
	}
}
