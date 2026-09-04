package main

import (
	"fmt"
	"net"
	"os"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/core"
)

// registerTrustedClientIP configures a single, application-wide source of
// client addresses before any route handles traffic. Forwarding headers are
// accepted only when the immediate peer belongs to an explicitly trusted
// proxy range; direct clients cannot spoof their rate-limit identity.
func registerTrustedClientIP(app core.App) {
	app.OnBeforeServe().PreAdd(func(event *core.ServeEvent) error {
		rawCIDRs := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDRS"))
		extractor, err := trustedClientIPExtractor(rawCIDRs)
		if err != nil {
			return fmt.Errorf("configure trusted proxy IP extraction: %w", err)
		}
		event.Router.IPExtractor = extractor
		return nil
	})
}

func trustedClientIPExtractor(rawCIDRs string) (echo.IPExtractor, error) {
	if strings.TrimSpace(rawCIDRs) == "" {
		return echo.ExtractIPDirect(), nil
	}
	options := []echo.TrustOption{
		echo.TrustLoopback(false),
		echo.TrustLinkLocal(false),
		echo.TrustPrivateNet(false),
	}
	for _, rawCIDR := range strings.Split(rawCIDRs, ",") {
		cidr := strings.TrimSpace(rawCIDR)
		if cidr == "" {
			return nil, fmt.Errorf("empty TRUSTED_PROXY_CIDRS entry")
		}
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			return nil, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS entry %q", cidr)
		}
		options = append(options, echo.TrustIPRange(network))
	}
	return echo.ExtractIPFromXFFHeader(options...), nil
}
