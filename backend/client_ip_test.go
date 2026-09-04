package main

import (
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
)

func TestTrustedClientIPExtractor(t *testing.T) {
	extractor, err := trustedClientIPExtractor("172.18.0.0/16")
	if err != nil {
		t.Fatalf("create extractor: %v", err)
	}

	tests := []struct {
		name       string
		remoteAddr string
		forwarded  string
		want       string
	}{
		{
			name:       "direct client cannot spoof forwarding header",
			remoteAddr: "203.0.113.10:49152",
			forwarded:  "198.51.100.77",
			want:       "203.0.113.10",
		},
		{
			name:       "trusted proxy supplies client address",
			remoteAddr: "172.18.0.4:49152",
			forwarded:  "198.51.100.21",
			want:       "198.51.100.21",
		},
		{
			name:       "rightmost untrusted hop wins",
			remoteAddr: "172.18.0.4:49152",
			forwarded:  "192.0.2.5, 198.51.100.22, 172.18.0.3",
			want:       "198.51.100.22",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			router := echo.New()
			router.IPExtractor = extractor
			request := httptest.NewRequest("GET", "/", nil)
			request.RemoteAddr = test.remoteAddr
			request.Header.Set(echo.HeaderXForwardedFor, test.forwarded)
			context := router.NewContext(request, httptest.NewRecorder())
			if got := context.RealIP(); got != test.want {
				t.Fatalf("RealIP() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestTrustedClientIPExtractorRejectsInvalidConfiguration(t *testing.T) {
	for _, raw := range []string{"not-a-cidr", "172.18.0.0/16,"} {
		if _, err := trustedClientIPExtractor(raw); err == nil {
			t.Fatalf("trustedClientIPExtractor(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestTrustedClientIPExtractorDefaultsToDirectPeer(t *testing.T) {
	extractor, err := trustedClientIPExtractor("")
	if err != nil {
		t.Fatalf("create direct extractor: %v", err)
	}
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "203.0.113.11:49152"
	request.Header.Set(echo.HeaderXForwardedFor, "198.51.100.99")
	if got := extractor(request); got != "203.0.113.11" {
		t.Fatalf("direct extractor = %q, want %q", got, "203.0.113.11")
	}
}
