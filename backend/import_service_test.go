package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"testing"
)

func minimalTestPDF(pageCount int) []byte {
	objects := make([]string, 3+2*pageCount)
	objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
	kids := make([]string, pageCount)
	for index := 0; index < pageCount; index++ {
		pageID := 3 + index
		contentID := 3 + pageCount + index
		kids[index] = fmt.Sprintf("%d 0 R", pageID)
		objects[pageID] = fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents %d 0 R >>", contentID)
		objects[contentID] = "<< /Length 0 >>\nstream\n\nendstream"
	}
	objects[2] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), pageCount)

	var output bytes.Buffer
	output.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for id := 1; id < len(objects); id++ {
		offsets[id] = output.Len()
		fmt.Fprintf(&output, "%d 0 obj\n%s\nendobj\n", id, objects[id])
	}
	xrefOffset := output.Len()
	fmt.Fprintf(&output, "xref\n0 %d\n0000000000 65535 f \n", len(objects))
	for id := 1; id < len(objects); id++ {
		fmt.Fprintf(&output, "%010d 00000 n \n", offsets[id])
	}
	fmt.Fprintf(&output, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects), xrefOffset)
	return output.Bytes()
}

func TestValidatePDFStructure(t *testing.T) {
	for _, pageCount := range []int{1, 2} {
		actual, err := validatePDFStructure(bytes.NewReader(minimalTestPDF(pageCount)))
		if err != nil {
			t.Fatalf("valid %d-page PDF was rejected: %v", pageCount, err)
		}
		if actual != pageCount {
			t.Fatalf("got %d pages; want %d", actual, pageCount)
		}
	}
	if _, err := validatePDFStructure(bytes.NewReader([]byte("%PDF-1.4\n%%EOF"))); err == nil {
		t.Fatal("expected structurally invalid PDF to be rejected")
	}
}

func TestNewRequestID(t *testing.T) {
	first := newRequestID()
	second := newRequestID()
	if len(first) < 16 {
		t.Fatalf("request id is too short: %q", first)
	}
	if first == second {
		t.Fatalf("request ids must be unique: %q", first)
	}
}

func TestLogUploadWritesStructuredJSON(t *testing.T) {
	var output bytes.Buffer
	previousWriter := log.Writer()
	previousFlags := log.Flags()
	previousPrefix := log.Prefix()
	log.SetOutput(&output)
	log.SetFlags(0)
	log.SetPrefix("")
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
		log.SetFlags(previousFlags)
		log.SetPrefix(previousPrefix)
	})

	logUpload("info", "test_event", map[string]any{
		"request_id": "req-123",
		"job_id":     "job-456",
		"empty":      "",
	})

	var entry map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &entry); err != nil {
		t.Fatalf("log entry is not valid JSON: %v; output=%q", err, output.String())
	}
	if entry["component"] != "upload_service" || entry["event"] != "test_event" {
		t.Fatalf("unexpected structured log: %#v", entry)
	}
	if entry["request_id"] != "req-123" || entry["job_id"] != "job-456" {
		t.Fatalf("missing correlation fields: %#v", entry)
	}
	if _, exists := entry["empty"]; exists {
		t.Fatalf("empty fields must be omitted: %#v", entry)
	}
}

func TestInspectUTF8(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
		valid bool
		bom   bool
	}{
		{name: "plain utf8", input: []byte("PDF页码,词条\n1,天光"), valid: true},
		{name: "utf8 bom", input: append([]byte{0xef, 0xbb, 0xbf}, []byte("PDF页码,词条")...), valid: true, bom: true},
		{name: "invalid utf8", input: []byte{0x50, 0x44, 0x46, 0xff, 0xfe}, valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			valid, bom, err := inspectUTF8(bytes.NewReader(test.input))
			if err != nil {
				t.Fatal(err)
			}
			if valid != test.valid || bom != test.bom {
				t.Fatalf("got valid=%v bom=%v; want valid=%v bom=%v", valid, bom, test.valid, test.bom)
			}
		})
	}
}

func TestValidateCSVHeaders(t *testing.T) {
	headers, pdfIndex, err := validateCSVHeaders([]string{"PDF页码", "词条", "释义"})
	if err != nil {
		t.Fatal(err)
	}
	if pdfIndex != 0 || strings.Join(headers, ",") != "PDF页码,词条,释义" {
		t.Fatalf("unexpected headers: %#v, pdfIndex=%d", headers, pdfIndex)
	}

	if _, _, err := validateCSVHeaders([]string{"词条", "词条"}); err == nil {
		t.Fatal("expected duplicate header validation error")
	}
	if _, _, err := validateCSVHeaders([]string{"词条", "释义"}); err == nil {
		t.Fatal("expected missing PDF页码 validation error")
	}
}

func TestResolveCSVHeadersSupportsAliases(t *testing.T) {
	tests := []struct {
		name     string
		headers  []string
		field    string
		pdfIndex int
	}{
		{name: "canonical", headers: []string{"PDF页码", "词条"}, field: "PDF页码", pdfIndex: 0},
		{name: "english page", headers: []string{"entry_id", "page", "word"}, field: "page", pdfIndex: 1},
		{name: "snake case", headers: []string{"word", "pdf_page"}, field: "pdf_page", pdfIndex: 1},
		{name: "chinese short", headers: []string{"页码", "词条"}, field: "页码", pdfIndex: 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, index, field, err := resolveCSVHeaders(test.headers)
			if err != nil {
				t.Fatal(err)
			}
			if index != test.pdfIndex || field != test.field {
				t.Fatalf("got index=%d field=%q; want index=%d field=%q", index, field, test.pdfIndex, test.field)
			}
		})
	}

	if _, _, _, err := resolveCSVHeaders([]string{"page", "PDF页码", "word"}); err == nil {
		t.Fatal("expected ambiguous page field error")
	}
	_, _, _, err := resolveCSVHeaders([]string{"entry_id", "word"})
	if err == nil || !strings.Contains(err.Error(), "entry_id") {
		t.Fatalf("missing-field error should list detected headers: %v", err)
	}
}

func TestBuildCSVPage(t *testing.T) {
	page, validationErr := buildCSVPage(
		[]string{"PDF页码", "词条", "释义"},
		[]string{"12", "天光", "早晨\n太阳刚出来"},
		0,
		2,
	)
	if validationErr != nil {
		t.Fatalf("unexpected error: %#v", validationErr)
	}
	if page.pdfPage != 12 || page.entryText != "天光 早晨\n太阳刚出来" {
		t.Fatalf("unexpected page: %#v", page)
	}
	if !strings.Contains(page.rowJSON, `"词条":"天光"`) {
		t.Fatalf("unexpected row json: %s", page.rowJSON)
	}

	_, validationErr = buildCSVPage(
		[]string{"PDF页码", "词条"},
		[]string{"abc", "天光"},
		0,
		9,
	)
	if validationErr == nil || validationErr.code != "INVALID_PDF_PAGE" || validationErr.line != 9 {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}

	_, validationErr = buildCSVPageWithLimit(
		[]string{"page", "词条"},
		[]string{"3", "超范围"},
		0,
		10,
		2,
	)
	if validationErr == nil || validationErr.code != "PDF_PAGE_OUT_OF_RANGE" || validationErr.rawValue != "3" {
		t.Fatalf("unexpected page-range validation error: %#v", validationErr)
	}
}
