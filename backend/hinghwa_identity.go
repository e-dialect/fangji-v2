package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	hinghwaProviderID       = "hinghwa"
	hinghwaProviderName     = "兴化语记"
	hinghwaRequestTimeout   = 5 * time.Second
	hinghwaMaxResponseBytes = 64 * 1024
)

type hinghwaIdentityProvider struct {
	endpoint string
	client   *http.Client
}

func newHinghwaIdentityProvider(baseURL string) (*hinghwaIdentityProvider, error) {
	return newHinghwaIdentityProviderWithClient(baseURL, http.DefaultClient, hinghwaRequestTimeout)
}

func newHinghwaIdentityProviderWithClient(baseURL string, client *http.Client, timeout time.Duration) (*hinghwaIdentityProvider, error) {
	base, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return nil, errors.New("Hinghwa identity base URL is invalid")
	}
	if base.Scheme != "https" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, fmt.Errorf("Hinghwa identity base URL must be an HTTPS origin or path without credentials, query, or fragment")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/login"
	base.RawPath = ""

	if client == nil {
		client = http.DefaultClient
	}
	clientCopy := *client
	clientCopy.Timeout = timeout
	clientCopy.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}

	return &hinghwaIdentityProvider{
		endpoint: base.String(),
		client:   &clientCopy,
	}, nil
}

func (p *hinghwaIdentityProvider) ID() string   { return hinghwaProviderID }
func (p *hinghwaIdentityProvider) Name() string { return hinghwaProviderName }

func (p *hinghwaIdentityProvider) Authenticate(ctx context.Context, identity, password string) (string, error) {
	payload, err := json.Marshal(map[string]string{
		"username": identity,
		"password": password,
	})
	if err != nil {
		return "", fmt.Errorf("%w: encode request", errExternalUnavailable)
	}
	defer clear(payload)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("%w: create request", errExternalUnavailable)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := p.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: request failed", errExternalUnavailable)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return "", errExternalCredentials
	}
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: unexpected status", errExternalUnavailable)
	}

	raw, err := io.ReadAll(io.LimitReader(response.Body, hinghwaMaxResponseBytes+1))
	if err != nil {
		return "", fmt.Errorf("%w: read response", errExternalUnavailable)
	}
	defer clear(raw)
	if len(raw) > hinghwaMaxResponseBytes {
		return "", fmt.Errorf("%w: response too large", errExternalUnavailable)
	}

	var result struct {
		ID    json.RawMessage `json:"id"`
		Token json.RawMessage `json:"token"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("%w: malformed response", errExternalUnavailable)
	}
	// The Django response includes an HS256 token. It is intentionally ignored,
	// zeroed and never persisted, logged, or returned to the browser.
	defer clear(result.ID)
	defer clear(result.Token)

	subject, err := normalizeHinghwaSubject(result.ID)
	if err != nil {
		return "", fmt.Errorf("%w: invalid subject", errExternalUnavailable)
	}
	return subject, nil
}

func normalizeHinghwaSubject(raw json.RawMessage) (string, error) {
	value := strings.TrimSpace(string(raw))
	if value == "" || value == "null" {
		return "", fmt.Errorf("missing subject")
	}
	if strings.HasPrefix(value, `"`) {
		var text string
		if err := json.Unmarshal(raw, &text); err != nil {
			return "", err
		}
		text = strings.TrimSpace(text)
		if text == "" || len(text) > 255 {
			return "", fmt.Errorf("invalid string subject")
		}
		return text, nil
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return "", fmt.Errorf("subject is not an integer")
		}
	}
	if len(value) > 255 {
		return "", fmt.Errorf("subject is too long")
	}
	return value, nil
}

// Nickname reads the public user profile without forwarding credentials or tokens.
// Profile failures must not prevent an otherwise valid external login.
func (p *hinghwaIdentityProvider) Nickname(ctx context.Context, subject string) string {
	return p.Profile(ctx, subject).Name
}

func (p *hinghwaIdentityProvider) Profile(ctx context.Context, subject string) externalProfile {
	// This upstream route accepts integer IDs only, never arbitrary paths.
	for _, char := range subject {
		if char < '0' || char > '9' {
			return externalProfile{}
		}
	}
	if subject == "" {
		return externalProfile{}
	}
	endpoint := strings.TrimSuffix(p.endpoint, "/login") + "/users/" + subject
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return externalProfile{}
	}
	request.Header.Set("Accept", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return externalProfile{}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return externalProfile{}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, hinghwaMaxResponseBytes+1))
	defer clear(raw)
	if err != nil || len(raw) > hinghwaMaxResponseBytes {
		return externalProfile{}
	}
	var result struct {
		User struct {
			ID       json.RawMessage `json:"id"`
			Nickname string          `json:"nickname"`
			Email    string          `json:"email"`
			Avatar   string          `json:"avatar"`
		} `json:"user"`
	}
	if json.Unmarshal(raw, &result) != nil {
		return externalProfile{}
	}
	id, err := normalizeHinghwaSubject(result.User.ID)
	if err != nil || id != subject {
		return externalProfile{}
	}
	name := strings.TrimSpace(result.User.Nickname)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) > 255 {
		name = ""
	}
	return externalProfile{Name: name, Email: strings.TrimSpace(result.User.Email), AvatarURL: strings.TrimSpace(result.User.Avatar)}
}
