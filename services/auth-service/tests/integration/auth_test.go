package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testcontainers 启动 ~5s, 所以一个 harness 跨整个 package 共享.
// 每个 test 通过 getH 拿到时会 Reset 数据库 + redis.
var (
	bootOnce sync.Once
	bootH    *harness
	bootErr  error
)

func getH(t *testing.T) *harness {
	t.Helper()
	bootOnce.Do(func() {
		defer func() {
			if r := recover(); r != nil {
				bootErr = fmt.Errorf("setup panic: %v", r)
			}
		}()
		bootH = setupHarness(t)
	})
	require.NoError(t, bootErr)
	require.NotNil(t, bootH, "harness boot failed")
	bootH.Reset(t)
	return bootH
}

// ---- HTTP helpers ----

type httpResp struct {
	Status int
	Body   map[string]any
}

func (r httpResp) Data() map[string]any {
	if v, ok := r.Body["data"].(map[string]any); ok {
		return v
	}
	return nil
}

func (r httpResp) ErrorCode() string {
	if e, ok := r.Body["error"].(map[string]any); ok {
		if c, ok := e["code"].(string); ok {
			return c
		}
	}
	return ""
}

func doJSON(t *testing.T, method, url string, body any, headers ...[2]string) httpResp {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, url, rdr)
	require.NoError(t, err)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, h := range headers {
		req.Header.Set(h[0], h[1])
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := httpResp{Status: resp.StatusCode}
	if len(raw) > 0 {
		require.NoError(t, json.Unmarshal(raw, &out.Body), "body: %s", raw)
	}
	return out
}

// ---- tests ----

func TestRegister_GoldenPath(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email":    "alice@example.com",
		"password": "S3cure-pass!",
		"name":     "Alice",
	})
	require.Equal(t, http.StatusCreated, r.Status, "body: %+v", r.Body)
	data := r.Data()
	require.NotNil(t, data)
	assert.NotEmpty(t, data["access_token"])
	assert.NotEmpty(t, data["refresh_token"])
	assert.Greater(t, data["expires_in"], float64(0))
	user := data["user"].(map[string]any)
	assert.Equal(t, "alice@example.com", user["email"])
	assert.Equal(t, "Alice", user["name"])
	team := data["team"].(map[string]any)
	assert.Equal(t, "Alice's Team", team["name"])
	assert.Equal(t, "free", team["plan"])
	assert.Equal(t, "owner", team["role"])
}

func TestRegister_DuplicateEmail(t *testing.T) {
	h := getH(t)
	body := map[string]string{"email": "dup@example.com", "password": "S3cure-pass!", "name": "X"}
	r1 := doJSON(t, "POST", h.URL("/v1/auth/register"), body)
	require.Equal(t, http.StatusCreated, r1.Status)
	r2 := doJSON(t, "POST", h.URL("/v1/auth/register"), body)
	assert.Equal(t, http.StatusConflict, r2.Status)
	assert.Equal(t, "EMAIL_ALREADY_EXISTS", r2.ErrorCode())
}

func TestRegister_InvalidInput(t *testing.T) {
	h := getH(t)
	cases := []map[string]string{
		{"email": "", "password": "S3cure-pass!", "name": "X"},
		{"email": "bad-email", "password": "S3cure-pass!", "name": "X"},
		{"email": "ok@example.com", "password": "short", "name": "X"},
		{"email": "ok@example.com", "password": "S3cure-pass!", "name": ""},
	}
	for i, c := range cases {
		t.Run(fmt.Sprintf("case-%d", i), func(t *testing.T) {
			// 用独立 IP 绕开 register 3/h 限流 (这个测试只关心输入校验).
			r := doJSON(t, "POST", h.URL("/v1/auth/register"), c,
				[2]string{"X-Forwarded-For", fmt.Sprintf("10.0.0.%d", i+1)})
			assert.Equal(t, http.StatusBadRequest, r.Status, "body: %+v", r.Body)
			assert.Equal(t, "INVALID_INPUT", r.ErrorCode())
		})
	}
}

func TestLogin_GoldenPath(t *testing.T) {
	h := getH(t)
	doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "bob@example.com", "password": "S3cure-pass!", "name": "Bob",
	})
	r := doJSON(t, "POST", h.URL("/v1/auth/login"), map[string]string{
		"email": "bob@example.com", "password": "S3cure-pass!",
	})
	require.Equal(t, http.StatusOK, r.Status)
	assert.NotEmpty(t, r.Data()["access_token"])
}

func TestLogin_WrongPassword(t *testing.T) {
	h := getH(t)
	doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "carol@example.com", "password": "S3cure-pass!", "name": "Carol",
	})
	r := doJSON(t, "POST", h.URL("/v1/auth/login"), map[string]string{
		"email": "carol@example.com", "password": "wrong-pass!",
	})
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	assert.Equal(t, "INVALID_CREDENTIALS", r.ErrorCode())
}

func TestLogin_LockAfterFiveFails(t *testing.T) {
	h := getH(t)
	doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "dave@example.com", "password": "S3cure-pass!", "name": "Dave",
	})
	for i := 0; i < 5; i++ {
		r := doJSON(t, "POST", h.URL("/v1/auth/login"), map[string]string{
			"email": "dave@example.com", "password": "wrong-pass!",
		})
		assert.Equal(t, http.StatusUnauthorized, r.Status, "attempt %d", i+1)
	}
	// 第 6 次 (无论密码对错) 应该被锁.
	r := doJSON(t, "POST", h.URL("/v1/auth/login"), map[string]string{
		"email": "dave@example.com", "password": "S3cure-pass!",
	})
	assert.Equal(t, http.StatusTooManyRequests, r.Status)
	assert.Equal(t, "RATE_LIMITED", r.ErrorCode())
}

func TestRefresh_RotationAndOldTokenDies(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "eve@example.com", "password": "S3cure-pass!", "name": "Eve",
	})
	oldRefresh := r.Data()["refresh_token"].(string)

	r2 := doJSON(t, "POST", h.URL("/v1/auth/refresh"), map[string]string{
		"refresh_token": oldRefresh,
	})
	require.Equal(t, http.StatusOK, r2.Status)
	newAccess := r2.Data()["access_token"].(string)
	newRefresh := r2.Data()["refresh_token"].(string)
	assert.NotEmpty(t, newAccess)
	assert.NotEqual(t, oldRefresh, newRefresh)

	// 老 refresh 应该已经被吊销 (postgres 表层), redis grace 30s 内可能仍能 GET 到 hash,
	// 但 GetActiveRefreshTokenByHash 会查表 → revoked_at not null → not found.
	r3 := doJSON(t, "POST", h.URL("/v1/auth/refresh"), map[string]string{
		"refresh_token": oldRefresh,
	})
	assert.Equal(t, http.StatusUnauthorized, r3.Status)
	assert.Equal(t, "INVALID_TOKEN", r3.ErrorCode())
}

func TestRefresh_InvalidToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/auth/refresh"), map[string]string{
		"refresh_token": "totally-fake-token",
	})
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	assert.Equal(t, "INVALID_TOKEN", r.ErrorCode())
}

func TestMe_WithValidToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "frank@example.com", "password": "S3cure-pass!", "name": "Frank",
	})
	access := r.Data()["access_token"].(string)

	me := doJSON(t, "GET", h.URL("/v1/me"), nil, [2]string{"Authorization", "Bearer " + access})
	require.Equal(t, http.StatusOK, me.Status, "body: %+v", me.Body)
	user := me.Data()["user"].(map[string]any)
	assert.Equal(t, "frank@example.com", user["email"])
	team := me.Data()["team"].(map[string]any)
	assert.Equal(t, "owner", team["role"])
}

func TestMe_MissingToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "GET", h.URL("/v1/me"), nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	assert.Equal(t, "INVALID_TOKEN", r.ErrorCode())
}

func TestMe_GarbageToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "GET", h.URL("/v1/me"), nil, [2]string{"Authorization", "Bearer not-a-jwt"})
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	assert.Equal(t, "INVALID_TOKEN", r.ErrorCode())
}

func TestLogout_RevokesRefresh(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "grace@example.com", "password": "S3cure-pass!", "name": "Grace",
	})
	refresh := r.Data()["refresh_token"].(string)

	lo := doJSON(t, "POST", h.URL("/v1/auth/logout"), map[string]string{"refresh_token": refresh})
	require.Equal(t, http.StatusOK, lo.Status)

	r2 := doJSON(t, "POST", h.URL("/v1/auth/refresh"), map[string]string{"refresh_token": refresh})
	assert.Equal(t, http.StatusUnauthorized, r2.Status)
}

func TestRegister_RateLimit(t *testing.T) {
	h := getH(t)
	for i := 0; i < 3; i++ {
		body := map[string]string{
			"email":    fmt.Sprintf("rl%d@example.com", i),
			"password": "S3cure-pass!",
			"name":     fmt.Sprintf("R%d", i),
		}
		r := doJSON(t, "POST", h.URL("/v1/auth/register"), body)
		assert.Equal(t, http.StatusCreated, r.Status, "i=%d", i)
	}
	r := doJSON(t, "POST", h.URL("/v1/auth/register"), map[string]string{
		"email": "rl_over@example.com", "password": "S3cure-pass!", "name": "X",
	})
	assert.Equal(t, http.StatusTooManyRequests, r.Status)
	assert.Equal(t, "RATE_LIMITED", r.ErrorCode())
}
