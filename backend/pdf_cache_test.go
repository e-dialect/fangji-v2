package main

import (
	"bytes"
	"errors"
	pdfapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pocketbase/pocketbase/core"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSplitPDFPagesKeepsRotationAndOnlyOnePage(t *testing.T) {
	dir := t.TempDir()
	if err := splitPDFPages(bytes.NewReader(renderingTestPDF()), dir, pdfBookBudget); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"1.pdf", "2.pdf", "3.pdf"} {
		f, err := os.Open(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		ctx, err := pdfapi.ReadAndValidate(f, pdfConfig())
		f.Close()
		if err != nil || ctx.PageCount != 1 {
			t.Fatalf("%s: %v", name, err)
		}
	}
	// Shared page resources remain renderable; expansion must respect the budget.
	if err := splitPDFPages(bytes.NewReader(renderingTestPDF()), t.TempDir(), 10); err == nil {
		t.Fatal("expected disk budget error")
	}
}
func TestPDFCacheExpiryAndEviction(t *testing.T) {
	root := t.TempDir()
	now := time.Now()
	write := func(name string, age time.Duration) {
		p := filepath.Join(root, name)
		if err := os.WriteFile(p, []byte("pdf"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, now.Add(-age), now.Add(-age)); err != nil {
			t.Fatal(err)
		}
	}
	write("watermark-old.pdf", pdfPreviewTTL+time.Second)
	write("watermark-live.pdf", time.Minute)
	dir := filepath.Join(root, "pages-old")
	_ = os.Mkdir(dir, 0700)
	_ = os.WriteFile(filepath.Join(dir, "1.pdf"), []byte("pdf"), 0600)
	_ = os.Chtimes(dir, now.Add(-pdfPagesTTL-time.Second), now.Add(-pdfPagesTTL-time.Second))
	cleanupPDFCache(root, now, 0)
	for _, name := range []string{"watermark-old.pdf", "pages-old"} {
		if _, err := os.Stat(filepath.Join(root, name)); !os.IsNotExist(err) {
			t.Fatalf("not expired: %s", name)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "watermark-live.pdf")); err != nil {
		t.Fatal(err)
	}
	cleanupPDFCache(root, now, pdfCacheBudget)
	entries, _ := os.ReadDir(root)
	if len(entries) != 0 {
		t.Fatal("budget eviction failed")
	}
}
func TestPDFCacheIdentityIsolation(t *testing.T) {
	base := pdfCacheKey("source", "1", "2", "alice", "task")
	for _, parts := range [][]string{{"source", "1", "2", "bob", "task"}, {"replacement", "1", "2", "alice", "task"}, {"source", "2", "3", "alice", "task"}, {"source", "1", "2", "alice", "other"}} {
		if pdfCacheKey(parts...) == base {
			t.Fatal("cross-identity cache collision")
		}
	}
}

func TestOversizedPDFSkipsRepeatedWholeBookPreparation(t *testing.T) {
	app := newSchemaTestApp(t)
	s := newImportService(app)
	collection, err := app.FindCollectionByNameOrId("project_files")
	if err != nil {
		t.Fatal(err)
	}
	file := core.NewRecord(collection)
	file.Id = "syntheticfile01"
	file.Set("file", "source.pdf")
	file.Set("file_hash", "version-one")
	root := s.pdfCacheDir()
	if err := os.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(root, "oversized-"+pdfSourceKey(file))
	if err := os.WriteFile(marker, nil, 0600); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := s.preparePDFPages(file); !errors.Is(err, errPDFPageBudget) {
			t.Fatalf("retried oversized source: %v", err)
		}
	}
	cleanupPDFCache(root, time.Now().Add(pdfPreviewTTL+time.Minute), 0)
	if _, err := os.Stat(marker); err != nil {
		t.Fatal("oversize marker expired with watermarks")
	}
	cleanupPDFCache(root, time.Now().Add(pdfPagesTTL+time.Second), 0)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("oversize marker did not expire")
	}
}
