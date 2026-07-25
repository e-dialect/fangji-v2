package main

import (
	"bytes"
	"strings"
	"testing"
)

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
}
