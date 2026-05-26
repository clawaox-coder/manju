package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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

func (r httpResp) DataList() []any {
	if v, ok := r.Body["data"].([]any); ok {
		return v
	}
	return nil
}

func (r httpResp) Meta() map[string]any {
	if v, ok := r.Body["meta"].(map[string]any); ok {
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
		// 204 没 body, 跳过解码
		if resp.StatusCode != http.StatusNoContent {
			require.NoError(t, json.Unmarshal(raw, &out.Body), "body: %s", raw)
		}
	}
	return out
}

func auth(tok string) [2]string {
	return [2]string{"Authorization", "Bearer " + tok}
}

// ---- tests ----

func TestAuth_RejectsMissingToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "GET", h.URL("/v1/projects"), nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	assert.Equal(t, "INVALID_TOKEN", r.ErrorCode())
}

func TestAuth_RejectsGarbageToken(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "GET", h.URL("/v1/projects"), nil, auth("garbage"))
	assert.Equal(t, http.StatusUnauthorized, r.Status)
}

func TestCreate_GoldenPath(t *testing.T) {
	h := getH(t)
	genre := "言情"
	r := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{
		"name":  "我的第一个项目",
		"genre": genre,
	}, auth(h.TeamA.OwnerToken))
	require.Equal(t, http.StatusCreated, r.Status, "body: %+v", r.Body)
	d := r.Data()
	assert.Equal(t, "我的第一个项目", d["name"])
	assert.Equal(t, h.TeamA.TeamID.String(), d["team_id"])
	assert.Equal(t, h.TeamA.OwnerID.String(), d["owner_id"])
	assert.Equal(t, "draft", d["status"])
}

func TestCreate_RejectsEmptyName(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{
		"name": "",
	}, auth(h.TeamA.OwnerToken))
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "INVALID_INPUT", r.ErrorCode())
}

func TestCreate_ViewerCannotCreate(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{
		"name": "X",
	}, auth(h.TeamA.ViewerToken))
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "INSUFFICIENT_PERMISSION", r.ErrorCode())
}

func TestProject_FullLifecycle(t *testing.T) {
	h := getH(t)
	tok := h.TeamA.OwnerToken

	// create
	c := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{
		"name": "P1", "genre": "sci-fi",
	}, auth(tok))
	require.Equal(t, http.StatusCreated, c.Status)
	id := c.Data()["id"].(string)

	// list 命中
	l := doJSON(t, "GET", h.URL("/v1/projects"), nil, auth(tok))
	require.Equal(t, http.StatusOK, l.Status)
	assert.True(t, findByID(l.DataList(), id), "list should contain new project")

	// get
	g := doJSON(t, "GET", h.URL("/v1/projects/"+id), nil, auth(tok))
	require.Equal(t, http.StatusOK, g.Status)
	assert.Equal(t, "P1", g.Data()["name"])

	// patch
	u := doJSON(t, "PATCH", h.URL("/v1/projects/"+id), map[string]any{
		"name": "P1-renamed",
	}, auth(tok))
	require.Equal(t, http.StatusOK, u.Status)
	assert.Equal(t, "P1-renamed", u.Data()["name"])

	// duplicate
	d := doJSON(t, "POST", h.URL("/v1/projects/"+id+"/duplicate"), nil, auth(tok))
	require.Equal(t, http.StatusCreated, d.Status)
	assert.NotEqual(t, id, d.Data()["id"])
	assert.Contains(t, d.Data()["name"].(string), "副本")

	// soft delete
	del := doJSON(t, "DELETE", h.URL("/v1/projects/"+id), nil, auth(tok))
	assert.Equal(t, http.StatusNoContent, del.Status)

	// get 404
	g2 := doJSON(t, "GET", h.URL("/v1/projects/"+id), nil, auth(tok))
	assert.Equal(t, http.StatusNotFound, g2.Status)

	// 进 trash
	trash := doJSON(t, "GET", h.URL("/v1/trash"), nil, auth(tok))
	require.Equal(t, http.StatusOK, trash.Status)
	assert.True(t, findByID(trash.DataList(), id), "trash should contain deleted project")

	// restore (走 /trash/:id/restore)
	rst := doJSON(t, "POST", h.URL("/v1/trash/"+id+"/restore"), nil, auth(tok))
	require.Equal(t, http.StatusOK, rst.Status)
	assert.Nil(t, rst.Data()["deleted_at"])

	// 再 soft delete + purge
	doJSON(t, "DELETE", h.URL("/v1/projects/"+id), nil, auth(tok))
	purge := doJSON(t, "DELETE", h.URL("/v1/trash/"+id), nil, auth(tok))
	assert.Equal(t, http.StatusNoContent, purge.Status)
	after := doJSON(t, "GET", h.URL("/v1/trash"), nil, auth(tok))
	assert.False(t, findByID(after.DataList(), id), "trash should not contain purged project")
}

func TestDrafts_ListDeleteClear(t *testing.T) {
	h := getH(t)
	tok := h.TeamA.OwnerToken

	a := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "D1"}, auth(tok))
	b := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "D2"}, auth(tok))
	require.Equal(t, http.StatusCreated, a.Status)
	require.Equal(t, http.StatusCreated, b.Status)

	l := doJSON(t, "GET", h.URL("/v1/drafts"), nil, auth(tok))
	require.Equal(t, http.StatusOK, l.Status)
	assert.Len(t, l.DataList(), 2)

	del := doJSON(t, "DELETE", h.URL("/v1/drafts/"+a.Data()["id"].(string)), nil, auth(tok))
	assert.Equal(t, http.StatusNoContent, del.Status)

	l2 := doJSON(t, "GET", h.URL("/v1/drafts"), nil, auth(tok))
	require.Equal(t, http.StatusOK, l2.Status)
	require.Len(t, l2.DataList(), 1)
	assert.Equal(t, b.Data()["id"], l2.DataList()[0].(map[string]any)["id"])

	clear := doJSON(t, "POST", h.URL("/v1/drafts"), nil, auth(tok))
	require.Equal(t, http.StatusOK, clear.Status)
	assert.Equal(t, float64(1), clear.Data()["removed"])

	l3 := doJSON(t, "GET", h.URL("/v1/drafts"), nil, auth(tok))
	assert.Len(t, l3.DataList(), 0)
}

func TestTrash_EmptyAll(t *testing.T) {
	h := getH(t)
	tok := h.TeamA.OwnerToken
	a := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "T1"}, auth(tok))
	b := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "T2"}, auth(tok))
	doJSON(t, "DELETE", h.URL("/v1/projects/"+a.Data()["id"].(string)), nil, auth(tok))
	doJSON(t, "DELETE", h.URL("/v1/projects/"+b.Data()["id"].(string)), nil, auth(tok))

	r := doJSON(t, "POST", h.URL("/v1/trash/empty"), nil, auth(tok))
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, float64(2), r.Data()["removed"])
}

func TestRLS_TeamBCannotSeeTeamA(t *testing.T) {
	h := getH(t)
	a := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "A-only"},
		auth(h.TeamA.OwnerToken))
	require.Equal(t, http.StatusCreated, a.Status)
	aID := a.Data()["id"].(string)

	// teamB owner 列表里没有 A 的项目
	listB := doJSON(t, "GET", h.URL("/v1/projects"), nil, auth(h.TeamB.OwnerToken))
	require.Equal(t, http.StatusOK, listB.Status)
	assert.False(t, findByID(listB.DataList(), aID))

	// teamB 直接 GET 404
	getB := doJSON(t, "GET", h.URL("/v1/projects/"+aID), nil, auth(h.TeamB.OwnerToken))
	assert.Equal(t, http.StatusNotFound, getB.Status)
}

func TestRLS_TeamBCannotDeleteTeamA(t *testing.T) {
	h := getH(t)
	a := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{"name": "A-only"},
		auth(h.TeamA.OwnerToken))
	require.Equal(t, http.StatusCreated, a.Status)
	del := doJSON(t, "DELETE", h.URL("/v1/projects/"+a.Data()["id"].(string)), nil,
		auth(h.TeamB.OwnerToken))
	// 因 RLS, B 看不到这个项目, soft-delete 找不到 → 404
	assert.Equal(t, http.StatusNotFound, del.Status)
}

func TestShared_EmptyForFreshUser(t *testing.T) {
	h := getH(t)
	r := doJSON(t, "GET", h.URL("/v1/shared"), nil, auth(h.TeamA.OwnerToken))
	require.Equal(t, http.StatusOK, r.Status)
	assert.Len(t, r.DataList(), 0)
}

func TestPagination_Cursor(t *testing.T) {
	h := getH(t)
	tok := h.TeamA.OwnerToken
	for i := 0; i < 25; i++ {
		r := doJSON(t, "POST", h.URL("/v1/projects"), map[string]any{
			"name": fmt.Sprintf("P%02d", i),
		}, auth(tok))
		require.Equal(t, http.StatusCreated, r.Status)
	}

	p1 := doJSON(t, "GET", h.URL("/v1/projects?page_size=10"), nil, auth(tok))
	require.Equal(t, http.StatusOK, p1.Status)
	assert.Len(t, p1.DataList(), 10)
	assert.True(t, p1.Meta()["has_more"].(bool))
	next, ok := p1.Meta()["next_cursor"].(string)
	require.True(t, ok)
	require.NotEmpty(t, next)

	p2 := doJSON(t, "GET", h.URL("/v1/projects?page_size=10&cursor="+next), nil, auth(tok))
	require.Equal(t, http.StatusOK, p2.Status)
	assert.Len(t, p2.DataList(), 10)
	assert.NotEqual(t,
		p1.DataList()[0].(map[string]any)["id"],
		p2.DataList()[0].(map[string]any)["id"])
}

// ---- internal ----

func findByID(items []any, id string) bool {
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		if m["id"] == id {
			return true
		}
	}
	return false
}
