package main

import (
	"mime/multipart"
	"testing"
)

func TestPDFUploadSizeBoundaries(t *testing.T) {
	for _, size := range []int64{80 * 1024 * 1024, 100 * 1024 * 1024, 100*1024*1024 + 1} {
		err := validateUploadHeader(&multipart.FileHeader{Filename: "original.pdf", Size: size}, ".pdf", maxPDFBytes)
		if (err == nil) != (size <= 100*1024*1024) {
			t.Fatalf("PDF size %d: %v", size, err)
		}
	}
	if err := validateUploadHeader(&multipart.FileHeader{Filename: "source.csv", Size: 50*1024*1024 + 1}, ".csv", maxCSVBytes); err == nil {
		t.Fatal("CSV limit must remain 50 MiB")
	}
}
