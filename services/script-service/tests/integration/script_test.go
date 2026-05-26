// Integration tests for script-service.

package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

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

func dataOf(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var env map[string]any
	require.NoError(t, json.Unmarshal(raw, &env))
	d, ok := env["data"].(map[string]any)
	require.True(t, ok, "data not object: %s", string(raw))
	return d
}

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

func detailsOf(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var env map[string]any
	require.NoError(t, json.Unmarshal(raw, &env))
	e, _ := env["error"].(map[string]any)
	d, _ := e["details"].(map[string]any)
	return d
}

// ---- scripts tests ----

func TestScriptGetAutoCreate(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	resp, raw := do(t, "GET", url, h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "%s", raw)
	d := dataOf(t, raw)
	require.Equal(t, h.TeamA.ProjectID.String(), d["project_id"])
	require.Equal(t, "", d["content"])
	require.Equal(t, "markdown", d["format"])
	require.Equal(t, float64(1), d["version_no"]) // 初始 1
}

func TestScriptPutOptimisticLockHappy(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))

	// 先 get 确保创建
	_, _ = do(t, "GET", url, h.TeamA.OwnerToken, nil)

	content := "# 林小七的故事\n\n## 第一幕\n\n开始。\n\n## 第二幕\n\n继续。"
	resp, raw := do(t, "PUT", url, h.TeamA.OwnerToken,
		map[string]any{"content": content, "expected_version_no": 1})
	require.Equal(t, http.StatusOK, resp.StatusCode, "put: %s", raw)
	d := dataOf(t, raw)
	require.Equal(t, content, d["content"])
	require.Equal(t, float64(2), d["version_no"])
	require.Equal(t, float64(2), d["scene_count"]) // 两个 "## "
	// word_count: 16 CJK (林小七的故事/第一幕/开始/第二幕/继续) + 5 标点 token (#, ##, 。, ##, 。)
	// 注: 算法把 markdown 标记与中文标点当独立 token 数, 跟 TS 版本一致. 不强求理想分词.
	require.Equal(t, float64(21), d["word_count"])
}

func TestScriptPutVersionConflict(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	_, _ = do(t, "GET", url, h.TeamA.OwnerToken, nil)

	// 第一次 OK
	resp, _ := do(t, "PUT", url, h.TeamA.OwnerToken,
		map[string]any{"content": "v1", "expected_version_no": 1})
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// 第二次用过期的 expected → 409
	resp, raw := do(t, "PUT", url, h.TeamA.OwnerToken,
		map[string]any{"content": "v2", "expected_version_no": 1})
	require.Equal(t, http.StatusConflict, resp.StatusCode, "%s", raw)
	require.Equal(t, "VERSION_CONFLICT", errCodeOf(t, raw))
	d := detailsOf(t, raw)
	require.Equal(t, float64(2), d["current_version_no"])
	require.Equal(t, float64(1), d["expected_version_no"])
}

func TestScriptVersionsListAndGet(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	_, _ = do(t, "GET", url, h.TeamA.OwnerToken, nil)

	// 写 3 个版本
	for i, c := range []string{"v1 content", "v2 content longer", "v3 final"} {
		resp, raw := do(t, "PUT", url, h.TeamA.OwnerToken,
			map[string]any{"content": c, "expected_version_no": i + 1})
		require.Equal(t, http.StatusOK, resp.StatusCode, "put %d: %s", i, raw)
	}

	// list versions
	resp, raw := do(t, "GET", url+"/versions", h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "%s", raw)
	items, _ := listOf(t, raw)
	require.Len(t, items, 3)
	// 按 version_no DESC, 应是 4, 3, 2 (PUT 后 version 是 2/3/4)
	require.Equal(t, float64(4), items[0].(map[string]any)["version_no"])
	require.Equal(t, float64(3), items[1].(map[string]any)["version_no"])
	require.Equal(t, float64(2), items[2].(map[string]any)["version_no"])
	// list 不返 content (summary)
	_, hasContent := items[0].(map[string]any)["content"]
	require.False(t, hasContent, "list summary 不应含 content")

	// get 单版本
	resp, raw = do(t, "GET", url+"/versions/3", h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	d := dataOf(t, raw)
	require.Equal(t, float64(3), d["version_no"])
	require.Equal(t, "v2 content longer", d["content"])
}

func TestScriptRestore(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	_, _ = do(t, "GET", url, h.TeamA.OwnerToken, nil)

	_, _ = do(t, "PUT", url, h.TeamA.OwnerToken,
		map[string]any{"content": "original", "expected_version_no": 1})
	_, _ = do(t, "PUT", url, h.TeamA.OwnerToken,
		map[string]any{"content": "edited", "expected_version_no": 2})

	// 当前是 version 3 (content=edited). restore version 2 (content=original).
	resp, raw := do(t, "POST", url+"/versions/2/restore", h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "%s", raw)
	d := dataOf(t, raw)
	require.Equal(t, "original", d["content"])
	require.Equal(t, float64(4), d["version_no"]) // 写新一版

	// list 应有 4 个版本
	resp, raw = do(t, "GET", url+"/versions", h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 3) // 2, 3, 4 (1 是初始 GET 自动 INSERT 没写 version, 实际版本数 = put 次数)
}

func TestScriptViewerCannotWrite(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))

	// viewer 可 GET
	resp, _ := do(t, "GET", url, h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// viewer 不能 PUT
	resp, raw := do(t, "PUT", url, h.TeamA.ViewerToken,
		map[string]any{"content": "x", "expected_version_no": 1})
	require.Equal(t, http.StatusForbidden, resp.StatusCode, "%s", raw)
	require.Equal(t, "INSUFFICIENT_PERMISSION", errCodeOf(t, raw))

	// viewer 不能 restore
	resp, _ = do(t, "POST", url+"/versions/1/restore", h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestScriptRLSCrossTeam(t *testing.T) {
	h := getH(t)

	// TeamA 创建 script
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	resp, _ := do(t, "GET", url, h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// TeamB 试图访问 TeamA 的 project script → 404 (project 不可见)
	resp, raw := do(t, "GET", url, h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode, "%s", raw)
	require.Equal(t, "PROJECT_NOT_FOUND", errCodeOf(t, raw))
}

// ---- shots tests ----

func TestShotsCreateAndList(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))

	// 创建 3 个 shot
	for _, name := range []string{"S1", "S2", "S3"} {
		resp, raw := do(t, "POST", base, h.TeamA.OwnerToken,
			map[string]any{"title": name, "duration_ms": 3000})
		require.Equal(t, http.StatusCreated, resp.StatusCode, "%s: %s", name, raw)
	}

	resp, raw := do(t, "GET", base, h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 3)
	// 顺序 S1, S2, S3 with order_index 0, 1, 2
	for i, expected := range []string{"S1", "S2", "S3"} {
		m := items[i].(map[string]any)
		require.Equal(t, expected, m["title"])
		require.Equal(t, float64(i), m["order_index"])
		require.Equal(t, float64(3000), m["duration_ms"])
	}
}

func TestShotsCreateAfter(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))

	// S1, S2, S3
	ids := []string{}
	for _, name := range []string{"S1", "S2", "S3"} {
		resp, raw := do(t, "POST", base, h.TeamA.OwnerToken, map[string]any{"title": name})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ids = append(ids, dataOf(t, raw)["id"].(string))
	}

	// 在 S1 后插一个 NEW
	resp, raw := do(t, "POST", base, h.TeamA.OwnerToken,
		map[string]any{"title": "NEW", "after_shot_id": ids[0]})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "%s", raw)
	d := dataOf(t, raw)
	require.Equal(t, "NEW", d["title"])
	require.Equal(t, float64(1), d["order_index"]) // S1=0, NEW=1, S2=2, S3=3

	// 再 list 确认排序
	resp, raw = do(t, "GET", base, h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 4)
	expectedOrder := []string{"S1", "NEW", "S2", "S3"}
	for i, want := range expectedOrder {
		require.Equal(t, want, items[i].(map[string]any)["title"], "pos %d", i)
		require.Equal(t, float64(i), items[i].(map[string]any)["order_index"])
	}
}

func TestShotsCreateAfterInvalidID(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))
	resp, raw := do(t, "POST", base, h.TeamA.OwnerToken,
		map[string]any{"title": "X", "after_shot_id": "00000000-0000-0000-0000-000000000000"})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s", raw)
	require.Equal(t, "INVALID_INPUT", errCodeOf(t, raw))
}

func TestShotsPatchAndExplicitNull(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))

	resp, raw := do(t, "POST", base, h.TeamA.OwnerToken,
		map[string]any{"title": "原标题", "dialog": "原对白"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// 改 title, 保留 dialog
	resp, raw = do(t, "PATCH", base+"/"+id, h.TeamA.OwnerToken,
		map[string]any{"title": "新标题"})
	require.Equal(t, http.StatusOK, resp.StatusCode)
	d := dataOf(t, raw)
	require.Equal(t, "新标题", d["title"])
	require.Equal(t, "原对白", d["dialog"])

	// 显式 null 清空 dialog
	resp, raw = do(t, "PATCH", base+"/"+id, h.TeamA.OwnerToken,
		map[string]any{"dialog": nil})
	require.Equal(t, http.StatusOK, resp.StatusCode)
	d = dataOf(t, raw)
	require.Equal(t, "新标题", d["title"])
	require.Nil(t, d["dialog"])

	// 试图改 order_index → 400
	resp, raw = do(t, "PATCH", base+"/"+id, h.TeamA.OwnerToken,
		map[string]any{"order_index": 99})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s", raw)
}

func TestShotsDeleteReindex(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))
	ids := []string{}
	for _, name := range []string{"S1", "S2", "S3", "S4"} {
		resp, raw := do(t, "POST", base, h.TeamA.OwnerToken, map[string]any{"title": name})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ids = append(ids, dataOf(t, raw)["id"].(string))
	}

	// 删 S2 (index 1)
	resp, _ := do(t, "DELETE", base+"/"+ids[1], h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	// 剩 S1(0), S3(1), S4(2) — 重排过
	resp, raw := do(t, "GET", base, h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 3)
	expected := []struct {
		title string
		order float64
	}{
		{"S1", 0}, {"S3", 1}, {"S4", 2},
	}
	for i, e := range expected {
		require.Equal(t, e.title, items[i].(map[string]any)["title"])
		require.Equal(t, e.order, items[i].(map[string]any)["order_index"])
	}
}

func TestShotsReorder(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))
	ids := []string{}
	for _, name := range []string{"A", "B", "C", "D"} {
		resp, raw := do(t, "POST", base, h.TeamA.OwnerToken, map[string]any{"title": name})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ids = append(ids, dataOf(t, raw)["id"].(string))
	}

	// 倒序: D, C, B, A
	newOrder := []string{ids[3], ids[2], ids[1], ids[0]}
	resp, raw := do(t, "PUT", base+"/reorder", h.TeamA.OwnerToken,
		map[string]any{"order": newOrder})
	require.Equal(t, http.StatusOK, resp.StatusCode, "%s", raw)
	items, _ := listOf(t, raw)
	require.Len(t, items, 4)
	want := []string{"D", "C", "B", "A"}
	for i, e := range want {
		require.Equal(t, e, items[i].(map[string]any)["title"])
		require.Equal(t, float64(i), items[i].(map[string]any)["order_index"])
	}
}

func TestShotsReorderValidation(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))
	ids := []string{}
	for _, n := range []string{"A", "B"} {
		resp, raw := do(t, "POST", base, h.TeamA.OwnerToken, map[string]any{"title": n})
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ids = append(ids, dataOf(t, raw)["id"].(string))
	}

	// 给少了 — 400
	resp, raw := do(t, "PUT", base+"/reorder", h.TeamA.OwnerToken,
		map[string]any{"order": []string{ids[0]}})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s", raw)

	// 重复 id — 400
	resp, raw = do(t, "PUT", base+"/reorder", h.TeamA.OwnerToken,
		map[string]any{"order": []string{ids[0], ids[0]}})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s", raw)

	// 含外来 id — 400
	resp, raw = do(t, "PUT", base+"/reorder", h.TeamA.OwnerToken,
		map[string]any{"order": []string{ids[0], "00000000-0000-0000-0000-000000000001"}})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "%s", raw)

	// 空 — 400
	resp, _ = do(t, "PUT", base+"/reorder", h.TeamA.OwnerToken,
		map[string]any{"order": []string{}})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestShotsViewerCannotWrite(t *testing.T) {
	h := getH(t)
	base := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))

	// owner 先建一个
	resp, raw := do(t, "POST", base, h.TeamA.OwnerToken, map[string]any{"title": "X"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// viewer 可 list
	resp, _ = do(t, "GET", base, h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// viewer 不能 create
	resp, _ = do(t, "POST", base, h.TeamA.ViewerToken, map[string]any{"title": "Y"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode)

	// 不能 patch
	resp, _ = do(t, "PATCH", base+"/"+id, h.TeamA.ViewerToken, map[string]any{"title": "Z"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode)

	// 不能 delete
	resp, _ = do(t, "DELETE", base+"/"+id, h.TeamA.ViewerToken, nil)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)

	// 不能 reorder
	resp, _ = do(t, "PUT", base+"/reorder", h.TeamA.ViewerToken, map[string]any{"order": []string{id}})
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestShotsRLSCrossTeam(t *testing.T) {
	h := getH(t)
	baseA := h.URL(fmt.Sprintf("/v1/projects/%s/shots", h.TeamA.ProjectID))

	// TeamA 创建 shot
	resp, raw := do(t, "POST", baseA, h.TeamA.OwnerToken, map[string]any{"title": "A shot"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	id := dataOf(t, raw)["id"].(string)

	// TeamB 试图 patch TeamA 的 shot → 404
	resp, _ = do(t, "PATCH", baseA+"/"+id, h.TeamB.OwnerToken, map[string]any{"title": "hacked"})
	require.Equal(t, http.StatusNotFound, resp.StatusCode)

	// TeamB list TeamA 的 project shots → 应是空 (project 不可见, shots 也看不到)
	resp, raw = do(t, "GET", baseA, h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 0)
}

func TestAuthRequired(t *testing.T) {
	h := getH(t)
	url := h.URL(fmt.Sprintf("/v1/projects/%s/script", h.TeamA.ProjectID))
	resp, _ := do(t, "GET", url, "", nil)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp, raw := do(t, "GET", url, "garbage", nil)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, "INVALID_TOKEN", errCodeOf(t, raw))
}
