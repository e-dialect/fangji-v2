package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestChunkUploadHTTP(t *testing.T) {
	app := newSchemaTestApp(t)
	users, _ := app.FindCollectionByNameOrId("users")
	projects, _ := app.FindCollectionByNameOrId("projects")
	tokens := []string{}
	records := []*core.Record{}
	for i := 0; i < 5; i++ {
		u := core.NewRecord(users)
		u.Set("username", fmt.Sprintf("upload-user-%d", i))
		u.Set("role", "platform_admin")
		u.SetPassword("UploadTest12345!")
		if err := app.Save(u); err != nil {
			t.Fatal(err)
		}
		token, _ := u.NewAuthToken()
		tokens = append(tokens, token)
		records = append(records, u)
	}
	project := core.NewRecord(projects)
	project.Set("name", "Upload fixture")
	project.Set("access_mode", "public")
	project.Set("required_proofreads", 2)
	project.Set("admin", records[0].Id)
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}
	s := newImportService(app)
	s.registerChunkUploads()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	stale := filepath.Join(app.DataDir(), "pdf-upload-staging-v1", "stale")
	_ = os.MkdirAll(stale, 0700)
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}); err != nil {
		t.Fatal(err)
	}
	defer app.OnTerminate().Trigger(&core.TerminateEvent{App: app})
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("restart did not clear old staging")
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, url, token string, body []byte, status int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, url, bytes.NewReader(body))
		r.Header.Set("Authorization", token)
		if method == "PUT" {
			r.Header.Set("Content-Type", "application/octet-stream")
		} else {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s status=%d want=%d body=%s", method, url, w.Code, status, w.Body.String())
		}
		return w.Body.Bytes()
	}
	base := "/api/fangji/projects/" + project.Id + "/pdf-uploads"
	create := func(token, key string, size int64, status int) string {
		b, _ := json.Marshal(map[string]any{"name": "book.pdf", "size": size, "requestId": key})
		raw := request("POST", base, token, b, status)
		var data map[string]any
		_ = json.Unmarshal(raw, &data)
		id, _ := data["id"].(string)
		return id
	}
	pdf := append(minimalTestPDF(2), bytes.Repeat([]byte("\n"), int(pdfChunkBytes))...)
	id := create(tokens[0], "first-request-0001", int64(len(pdf)), 201)
	if again := create(tokens[0], "first-request-0001", int64(len(pdf)), 200); again != id {
		t.Fatal("lost create response duplicated session")
	}
	create(tokens[0], "second-request-0002", 1, 429)
	request("PUT", base+"/"+id+"/chunks/0", tokens[1], pdf[:pdfChunkBytes], 404)
	request("POST", base+"/"+id+"/complete", tokens[0], nil, 409)
	request("PUT", base+"/"+id+"/chunks/-1", tokens[0], pdf[:pdfChunkBytes], 400)
	request("PUT", base+"/"+id+"/chunks/9", tokens[0], pdf[:pdfChunkBytes], 400)
	request("PUT", base+"/"+id+"/chunks/0", tokens[0], pdf[:20], 400)
	request("PUT", base+"/"+id+"/chunks/0", tokens[0], pdf[:pdfChunkBytes], 204)
	request("PUT", base+"/"+id+"/chunks/0", tokens[0], pdf[:pdfChunkBytes], 204)
	different := bytes.Clone(pdf[:pdfChunkBytes])
	different[10] ^= 1
	request("PUT", base+"/"+id+"/chunks/0", tokens[0], different, 409)
	request("PUT", base+"/"+id+"/chunks/1", tokens[0], pdf[pdfChunkBytes:], 204)
	var first, second struct {
		ID   string `json:"id"`
		Hash string `json:"file_hash"`
	}
	_ = json.Unmarshal(request("POST", base+"/"+id+"/complete", tokens[0], nil, 202), &first)
	_ = json.Unmarshal(request("POST", base+"/"+id+"/complete", tokens[0], nil, 200), &second)
	if first.ID == "" || second.ID != first.ID || first.Hash != fmt.Sprintf("%x", sha256.Sum256(pdf)) {
		t.Fatal("completion not idempotent or assembled bytes changed")
	}
	file, _ := app.FindRecordById("project_files", first.ID)
	reader, closeFile, err := s.openRecordFile(file, "file")
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := io.ReadAll(reader)
	closeFile()
	if !bytes.Equal(pdf, stored) {
		t.Fatal("original bytes not preserved")
	}
	if _, err := os.Stat(filepath.Join(app.DataDir(), "pdf-upload-staging-v1", id)); !os.IsNotExist(err) {
		t.Fatal("completed staging retained")
	}
	request("DELETE", base+"/"+id, tokens[0], nil, 204)
	ids := []string{}
	for i := 0; i < 4; i++ {
		ids = append(ids, create(tokens[i], fmt.Sprintf("quota-request-%04d", i), maxPDFBytes, 201))
	}
	create(tokens[4], "quota-request-0004", 1, 429)
	request("PUT", base+"/"+ids[0]+"/chunks/0", tokens[0], pdf[:pdfChunkBytes], 204)
	request("DELETE", base+"/"+ids[0], tokens[0], nil, 204)
	if _, err := os.Stat(filepath.Join(app.DataDir(), "pdf-upload-staging-v1", ids[0])); !os.IsNotExist(err) {
		t.Fatal("canceled bytes retained")
	}
	request("DELETE", base+"/"+ids[0], tokens[0], nil, 204)
	create(tokens[4], "quota-request-0004", 1, 201)
	create(tokens[0], "oversized-request1", maxPDFBytes+1, 400)
	// A session owner who loses manager rights can no longer write or complete.
	records[1].Set("role", "user")
	if err := app.Save(records[1]); err != nil {
		t.Fatal(err)
	}
	token, _ := records[1].NewAuthToken()
	request("PUT", base+"/"+ids[1]+"/chunks/0", token, pdf[:pdfChunkBytes], 403)
	request("POST", base+"/"+ids[1]+"/complete", token, nil, 403)
	request("DELETE", base+"/"+ids[1], token, nil, 403)
	create(token, "revoked-request-1", 1, 403)
	request("POST", base, "", nil, 401)
}
func TestChunkUploadExpiryAndTampering(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "upload")
	_ = os.Mkdir(dir, 0700)
	data := []byte("%PDF-fixture")
	u := &pdfUploadSession{dir: dir, size: int64(len(data)), touched: time.Now().Add(-pdfUploadTTL - time.Second), hashes: map[int][32]byte{0: sha256.Sum256(data)}}
	_ = os.WriteFile(filepath.Join(dir, "0.part"), []byte("tampered"), 0600)
	if _, err := assemblePDFUpload(u, filepath.Join(dir, "assembled.pdf")); err == nil {
		t.Fatal("tampered chunk accepted")
	}
	_ = os.WriteFile(filepath.Join(dir, "0.part"), data, 0600)
	u.size++
	if _, err := assemblePDFUpload(u, filepath.Join(dir, "assembled.pdf")); err == nil {
		t.Fatal("wrong total length accepted")
	}
	p := &pdfUploadPool{root: root, sessions: map[string]*pdfUploadSession{"id": u}}
	p.cleanup(time.Now())
	if len(p.sessions) != 0 {
		t.Fatal("expired session retained")
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("expired bytes retained")
	}
}
