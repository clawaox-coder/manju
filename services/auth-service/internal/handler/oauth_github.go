// GitHub OAuth helper functions: token exchange + user/email fetch.

package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
)

type githubUser struct {
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func exchangeGitHubCode(ctx context.Context, clientID, clientSecret, code string) (string, error) {
	body := fmt.Sprintf(
		`{"client_id":%q,"client_secret":%q,"code":%q}`,
		clientID, clientSecret, code,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(body))
	if err != nil {
		return "", apperr.Internal("build github token request").WithCause(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", apperr.Internal("github token exchange").WithCause(err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", apperr.Internal("parse github token response").WithCause(err)
	}
	if result.Error != "" || result.AccessToken == "" {
		return "", apperr.Internal("github oauth: " + result.Error)
	}
	return result.AccessToken, nil
}

func fetchGitHubUser(ctx context.Context, token string) (githubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return githubUser{}, apperr.Internal("build github user request").WithCause(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return githubUser{}, apperr.Internal("fetch github user").WithCause(err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var u githubUser
	if err := json.Unmarshal(raw, &u); err != nil {
		return githubUser{}, apperr.Internal("parse github user").WithCause(err)
	}
	return u, nil
}

func fetchGitHubEmail(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", apperr.Internal("build github emails request").WithCause(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", apperr.Internal("fetch github emails").WithCause(err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var emails []githubEmail
	if err := json.Unmarshal(raw, &emails); err != nil {
		return "", apperr.Internal("parse github emails").WithCause(err)
	}

	// 优先取 primary + verified
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	// fallback: 任意 verified
	for _, e := range emails {
		if e.Verified {
			return e.Email, nil
		}
	}
	if len(emails) > 0 {
		return emails[0].Email, nil
	}
	return "", apperr.InvalidInput("GitHub 账号未提供邮箱")
}