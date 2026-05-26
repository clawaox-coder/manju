// Integration tests for asset-service.
// 覆盖: CRUD * 5 类型路径 + RLS 跨 team 隔离 + viewer RBAC + cursor 分页 +
// PATCH unset/null 区分 + 预签 PUT 实测往 minio 上传.

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- HTTP helpers ----

func do(t *testing.T, method, url, token string, body any) (*http.Response, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		require.NoError(t, err)
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, url, rdr)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, raw
}

// envelope: {"data": {...}, "meta": {...}}
func dataOf(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var env map[string]any
	require.NoError(t, json.Unmarshal(raw, &env))
	d, ok := env["data"].(map[string]any)
	require.True(t, ok, "data not object: %s", string(raw))
	return d
}

// list envelope: {"data": [...], "meta": {...}}
func listOf(t *testing.T, raw []byte) ([]any, map[string]any) {
	t.Helper()
	var env map[string]any
	require.NoError(t, json.Unmarshal(raw, &env))
	d, _ := env["data"].([]any)
	m, _ := env["meta"].(map[string]any)
	return d, m
}

func errCodeOf(t *testing.T, raw []byte) string {
	t.Helper()
	var env map[string]any
	require.NoError(t, json.Unmarshal(raw, &env))
	e, _ := env["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

// ---- tests ----

func TestCreateAndGet(t *testing.T) {
	h := getH(t)

	body := map[string]any{
		"name":        "林小七",
		"description": "主角",
		"tags":        []string{"主角", "人类"},
		"avatar":      "🧒",
		"bg_style":    "anime",
	}
	resp, raw := do(t, "POST", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken, body)
	require.Equal(t, http.StatusCreated, resp.StatusCode, "create: %s", raw)
	d := dataOf(t, raw)
	id := d["id"].(string)
	require.Equal(t, "character", d["type"])
	require.Equal(t, "林小七", d["name"])
	require.Equal(t, h.TeamA.TeamID.String(), d["team_id"])

	// get
	resp, raw = do(t, "GET", h.URL("/v1/assets/characters/"+id), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "get: %s", raw)
	d = dataOf(t, raw)
	require.Equal(t, "林小七", d["name"])

	// 跨 type 拿不到 (URL 是 scenes 但 id 是 character)
	resp, _ = do(t, "GET", h.URL("/v1/assets/scenes/"+id), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestListByType(t *testing.T) {
	h := getH(t)

	// create 跨 type 各 1 + characters 多个
	create := func(typeSeg, name string) {
		resp, raw := do(t, "POST", h.URL("/v1/assets/"+typeSeg), h.TeamA.OwnerToken,
			map[string]any{"name": name})
		require.Equal(t, http.StatusCreated, resp.StatusCode, "create %s: %s", typeSeg, raw)
	}
	create("characters", "主角A")
	create("characters", "主角B")
	create("scenes", "客厅")
	create("props", "雨伞")
	create("music", "BGM1")
	create("sfx", "门铃")

	// list characters → 应只看到 2 个
	resp, raw := do(t, "GET", h.URL("/v1/assets/characters?page_size=10"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "list: %s", raw)
	items, meta := listOf(t, raw)
	require.Len(t, items, 2)
	require.Equal(t, false, meta["has_more"])
	for _, it := range items {
		require.Equal(t, "character", it.(map[string]any)["type"])
	}

	// list scenes → 1 个
	resp, raw = do(t, "GET", h.URL("/v1/assets/scenes"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ = listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "scene", items[0].(map[string]any)["type"])
}

func TestListCursorPagination(t *testing.T) {
	h := getH(t)

	// 创建 5 个 props
	for i := 0; i < 5; i++ {
		resp, _ := do(t, "POST", h.URL("/v1/assets/props"), h.TeamA.OwnerToken,
			map[string]any{"name": fmt.Sprintf("prop-%d", i)})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		time.Sleep(5 * time.Millisecond) // 让 updated_at 不同
	}

	// page_size=2 → 第一页 2 个, has_more=true, next_cursor 非空
	resp, raw := do(t, "GET", h.URL("/v1/assets/props?page_size=2"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, meta := listOf(t, raw)
	require.Len(t, items, 2)
	require.Equal(t, true, meta["has_more"])
	cursor, ok := meta["next_cursor"].(string)
	require.True(t, ok, "next_cursor missing in %v", meta)
	require.NotEmpty(t, cursor)

	// 第二页
	resp, raw = do(t, "GET", h.URL("/v1/assets/props?page_size=2&cursor="+cursor), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, meta = listOf(t, raw)
	require.Len(t, items, 2)
	require.Equal(t, true, meta["has_more"])

	// 第三页 (剩 1)
	cursor = meta["next_cursor"].(string)
	resp, raw = do(t, "GET", h.URL("/v1/assets/props?page_size=2&cursor="+cursor), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, meta = listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, false, meta["has_more"])
	require.Nil(t, meta["next_cursor"])
}

func TestListFilterQAndTags(t *testing.T) {
	h := getH(t)

	mk := func(name string, tags []string) {
		resp, _ := do(t, "POST", h.URL("/v1/assets/scenes"), h.TeamA.OwnerToken,
			map[string]any{"name": name, "tags": tags})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
	}
	mk("夜晚客厅", []string{"夜晚", "室内"})
	mk("白天客厅", []string{"白天", "室内"})
	mk("夜晚街道", []string{"夜晚", "室外"})

	// q=客厅 → 命中 2 个
	resp, raw := do(t, "GET", h.URL("/v1/assets/scenes?q=%E5%AE%A2%E5%8E%85"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 2)

	// tags=夜晚 → 命中 2 个
	resp, raw = do(t, "GET", h.URL("/v1/assets/scenes?tags=%E5%A4%9C%E6%99%9A"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ = listOf(t, raw)
	require.Len(t, items, 2)

	// tags=夜晚,室内 → 仅夜晚客厅 (AND 语义, @>)
	resp, raw = do(t, "GET",
		h.URL("/v1/assets/scenes?tags=%E5%A4%9C%E6%99%9A,%E5%AE%A4%E5%86%85"),
		h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ = listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "夜晚客厅", items[0].(map[string]any)["name"])
}

func TestPatchFieldsAndExplicitNull(t *testing.T) {
	h := getH(t)

	resp, raw := do(t, "POST", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken,
		map[string]any{"name": "原名", "description": "原描述", "bg_style": "anime"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// 只改 name
	resp, raw = do(t, "PATCH", h.URL("/v1/assets/characters/"+id), h.TeamA.OwnerToken,
		map[string]any{"name": "新名"})
	require.Equal(t, http.StatusOK, resp.StatusCode, "patch: %s", raw)
	d := dataOf(t, raw)
	require.Equal(t, "新名", d["name"])
	require.Equal(t, "原描述", d["description"]) // 未改

	// 显式 null 清空 description
	resp, raw = do(t, "PATCH", h.URL("/v1/assets/characters/"+id), h.TeamA.OwnerToken,
		map[string]any{"description": nil})
	require.Equal(t, http.StatusOK, resp.StatusCode, "patch null: %s", raw)
	d = dataOf(t, raw)
	require.Equal(t, "新名", d["name"]) // 仍是新名
	require.Nil(t, d["description"])

	// 不能改 type
	resp, raw = do(t, "PATCH", h.URL("/v1/assets/characters/"+id), h.TeamA.OwnerToken,
		map[string]any{"type": "scene"})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "patch type: %s", raw)
}

func TestSoftDelete(t *testing.T) {
	h := getH(t)
	resp, raw := do(t, "POST", h.URL("/v1/assets/music"), h.TeamA.OwnerToken,
		map[string]any{"name": "tobe-deleted"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	resp, _ = do(t, "DELETE", h.URL("/v1/assets/music/"+id), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	resp, _ = do(t, "GET", h.URL("/v1/assets/music/"+id), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestRLSCrossTeamIsolation(t *testing.T) {
	h := getH(t)

	// TeamA owner 创一个
	resp, raw := do(t, "POST", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken,
		map[string]any{"name": "TeamA only"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// TeamB owner 看不到
	resp, _ = do(t, "GET", h.URL("/v1/assets/characters/"+id), h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode,
		"RLS 应阻挡 TeamB 看到 TeamA 的资产")

	// TeamB list 也应是空 (无自己的 character)
	resp, raw = do(t, "GET", h.URL("/v1/assets/characters"), h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 0)
}

func TestViewerCannotWrite(t *testing.T) {
	h := getH(t)

	// owner 创一个供 viewer 读
	resp, raw := do(t, "POST", h.URL("/v1/assets/sfx"), h.TeamA.OwnerToken,
		map[string]any{"name": "shared sfx"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// viewer 可 list
	resp, _ = do(t, "GET", h.URL("/v1/assets/sfx"), h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// viewer 可 get
	resp, _ = do(t, "GET", h.URL("/v1/assets/sfx/"+id), h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// viewer 不能 create
	resp, raw = do(t, "POST", h.URL("/v1/assets/sfx"), h.TeamA.ViewerToken,
		map[string]any{"name": "by viewer"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode, "viewer create: %s", raw)
	require.Equal(t, "INSUFFICIENT_PERMISSION", errCodeOf(t, raw))

	// viewer 不能 patch
	resp, raw = do(t, "PATCH", h.URL("/v1/assets/sfx/"+id), h.TeamA.ViewerToken,
		map[string]any{"name": "ha"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode, "viewer patch: %s", raw)

	// viewer 不能 delete
	resp, _ = do(t, "DELETE", h.URL("/v1/assets/sfx/"+id), h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)

	// viewer 不能预签上传
	resp, raw = do(t, "POST", h.URL("/v1/upload/sign"), h.TeamA.ViewerToken,
		map[string]any{"filename": "f.png", "content_type": "image/png", "size_bytes": 100, "purpose": "x"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode, "viewer sign: %s", raw)
}

func TestAuthRequired(t *testing.T) {
	h := getH(t)
	resp, _ := do(t, "GET", h.URL("/v1/assets/characters"), "", nil)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	resp, raw := do(t, "GET", h.URL("/v1/assets/characters"), "garbage", nil)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, "INVALID_TOKEN", errCodeOf(t, raw))
}

func TestInvalidTypeSegment(t *testing.T) {
	h := getH(t)
	resp, raw := do(t, "GET", h.URL("/v1/assets/garbage"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "garbage: %s", raw)
	require.Equal(t, "INVALID_INPUT", errCodeOf(t, raw))
}

// voices URL 在 T-009 切片补回 (0002 migration 加 enum value).
func TestVoicesType(t *testing.T) {
	h := getH(t)
	resp, raw := do(t, "POST", h.URL("/v1/assets/voices"), h.TeamA.OwnerToken,
		map[string]any{"name": "旁白男声", "duration_ms": 3000})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "%s", raw)
	d := dataOf(t, raw)
	require.Equal(t, "voice", d["type"])

	resp, raw = do(t, "GET", h.URL("/v1/assets/voices"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "voice", items[0].(map[string]any)["type"])
}

func TestSignUploadAndPut(t *testing.T) {
	h := getH(t)

	// 1) 预签
	resp, raw := do(t, "POST", h.URL("/v1/upload/sign"), h.TeamA.OwnerToken,
		map[string]any{
			"filename":     "test.png",
			"content_type": "image/png",
			"size_bytes":   12,
			"purpose":      "character-portrait",
			"asset_type":   "characters",
		})
	require.Equal(t, http.StatusOK, resp.StatusCode, "sign: %s", raw)
	d := dataOf(t, raw)
	uploadURL, _ := d["upload_url"].(string)
	require.NotEmpty(t, uploadURL)
	require.Equal(t, "PUT", d["method"])
	fileURL, _ := d["file_url"].(string)
	require.NotEmpty(t, fileURL)
	require.Contains(t, fileURL, testBucket)
	require.Contains(t, fileURL, h.TeamA.TeamID.String())

	// 2) 用 returned URL 实际 PUT 上去
	put, err := http.NewRequest("PUT", uploadURL, bytes.NewReader([]byte("hello world\n")))
	require.NoError(t, err)
	put.Header.Set("Content-Type", "image/png")
	putResp, err := http.DefaultClient.Do(put)
	require.NoError(t, err)
	defer putResp.Body.Close()
	bodyBytes, _ := io.ReadAll(putResp.Body)
	require.Equal(t, http.StatusOK, putResp.StatusCode,
		"PUT to presigned URL failed: %d %s", putResp.StatusCode, bodyBytes)

	// 3) 用 s3 admin client 的 HeadObject 验证对象就位 (绕开 bucket 公开访问问题:
	//    bucket 默认 private; 前端生产环境通过 CDN/公开策略访问, 不在 m1 切片范围)。
	key, _ := d["key"].(string)
	require.NotEmpty(t, key)
	require.NoError(t, h.s3.HeadObject(context.Background(), key),
		"HeadObject after PUT should succeed")
}

func TestSignUploadValidation(t *testing.T) {
	h := getH(t)
	cases := []struct {
		name   string
		body   map[string]any
		code   string
	}{
		{"empty filename", map[string]any{"filename": "", "content_type": "image/png", "size_bytes": 1, "purpose": "x"}, "INVALID_INPUT"},
		{"zero size", map[string]any{"filename": "a.png", "content_type": "image/png", "size_bytes": 0, "purpose": "x"}, "INVALID_INPUT"},
		{"too big", map[string]any{"filename": "a.png", "content_type": "image/png", "size_bytes": 600 * 1024 * 1024, "purpose": "x"}, "INVALID_INPUT"},
		{"missing purpose", map[string]any{"filename": "a.png", "content_type": "image/png", "size_bytes": 1, "purpose": ""}, "INVALID_INPUT"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := do(t, "POST", h.URL("/v1/upload/sign"), h.TeamA.OwnerToken, tc.body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s: %s", tc.name, raw)
			require.Equal(t, tc.code, errCodeOf(t, raw))
		})
	}
}

func TestCreateValidationErrors(t *testing.T) {
	h := getH(t)
	cases := []struct {
		name string
		body map[string]any
	}{
		{"empty name", map[string]any{"name": ""}},
		{"name too long", map[string]any{"name": strings.Repeat("a", 101)}},
		{"avatar too long", map[string]any{"name": "x", "avatar": strings.Repeat("X", 11)}},
		{"negative duration", map[string]any{"name": "x", "duration_ms": -1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := do(t, "POST", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken, tc.body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s: %s", tc.name, raw)
		})
	}
}

// 多步综合: 预签 → PUT → 用 file_url 创建 asset → list 含 file_url
func TestFullUploadCreateFlow(t *testing.T) {
	h := getH(t)

	resp, raw := do(t, "POST", h.URL("/v1/upload/sign"), h.TeamA.OwnerToken,
		map[string]any{"filename": "char.png", "content_type": "image/png", "size_bytes": 7, "purpose": "c", "asset_type": "characters"})
	require.Equal(t, http.StatusOK, resp.StatusCode, "sign: %s", raw)
	signed := dataOf(t, raw)
	uploadURL := signed["upload_url"].(string)
	fileURL := signed["file_url"].(string)
	key := signed["key"].(string)

	put, _ := http.NewRequest("PUT", uploadURL, bytes.NewReader([]byte("PNGFAKE")))
	put.Header.Set("Content-Type", "image/png")
	pr, err := http.DefaultClient.Do(put)
	require.NoError(t, err)
	pr.Body.Close()
	require.Equal(t, http.StatusOK, pr.StatusCode)

	// 对象就位 (admin HeadObject)
	require.NoError(t, h.s3.HeadObject(context.Background(), key))

	resp, raw = do(t, "POST", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken,
		map[string]any{"name": "with-image", "file_url": fileURL})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "create: %s", raw)
	require.Equal(t, fileURL, dataOf(t, raw)["file_url"])

	// list 应含
	resp, raw = do(t, "GET", h.URL("/v1/assets/characters"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, fileURL, items[0].(map[string]any)["file_url"])
}

// 跨 team 给 file_url 不会冲突 (RLS 隔离)
func TestRLSDoesntLeakViaFileURL(t *testing.T) {
	h := getH(t)
	// TeamA 创一个有 file_url 的
	resp, raw := do(t, "POST", h.URL("/v1/assets/scenes"), h.TeamA.OwnerToken,
		map[string]any{"name": "A's scene", "file_url": "http://example.com/x.png"})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "%s", raw)

	// TeamB list 应是空, 与 file_url 无关
	resp, raw = do(t, "GET", h.URL("/v1/assets/scenes"), h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	assert.Len(t, items, 0)
}
