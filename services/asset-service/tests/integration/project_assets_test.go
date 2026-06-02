// Integration tests for project_assets (项目 ↔ 资产关联, role 区分用途).
// 覆盖: 关联 + 幂等 + 按 role 查询 + 跨 team 隔离 + viewer RBAC + 非法 role + 非法 uuid.

package integration

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// 建一个角色资产, 返回其 id.
func createCharacter(t *testing.T, h *harness, token, name string) string {
	t.Helper()
	resp, raw := do(t, "POST", h.URL("/v1/assets/characters"), token,
		map[string]any{"name": name, "file_url": "https://example.com/x.png"})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "create char: %s", raw)
	return dataOf(t, raw)["id"].(string)
}

func TestLinkAndListProjectAsset(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	aid := createCharacter(t, h, h.TeamA.OwnerToken, "林夏")

	// 关联
	resp, raw := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
		map[string]any{"asset_id": aid, "role": "character_ref"})
	require.Equal(t, http.StatusCreated, resp.StatusCode, "link: %s", raw)

	// 按 role 列出 → 1 个
	resp, raw = do(t, "GET", h.URL("/v1/projects/"+pid+"/assets?role=character_ref"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "list: %s", raw)
	items, _ := listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "林夏", items[0].(map[string]any)["name"])

	// role 默认 character_ref (不传 role)
	resp, raw = do(t, "GET", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ = listOf(t, raw)
	require.Len(t, items, 1)
}

func TestLinkIdempotent(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	aid := createCharacter(t, h, h.TeamA.OwnerToken, "重复关联")

	for i := 0; i < 3; i++ {
		resp, raw := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
			map[string]any{"asset_id": aid, "role": "character_ref"})
		require.Equal(t, http.StatusCreated, resp.StatusCode, "link #%d: %s", i, raw)
	}
	// 仍只有 1 条 (幂等)
	resp, raw := do(t, "GET", h.URL("/v1/projects/"+pid+"/assets?role=character_ref"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 1)
}

func TestListByRoleFiltering(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	a1 := createCharacter(t, h, h.TeamA.OwnerToken, "角色参考")
	a2 := createCharacter(t, h, h.TeamA.OwnerToken, "风格参考")

	link := func(aid, role string) {
		resp, raw := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
			map[string]any{"asset_id": aid, "role": role})
		require.Equal(t, http.StatusCreated, resp.StatusCode, "link %s: %s", role, raw)
	}
	link(a1, "character_ref")
	link(a2, "style_ref")

	// character_ref 只看到 a1
	resp, raw := do(t, "GET", h.URL("/v1/projects/"+pid+"/assets?role=character_ref"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ := listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "角色参考", items[0].(map[string]any)["name"])

	// style_ref 只看到 a2
	resp, raw = do(t, "GET", h.URL("/v1/projects/"+pid+"/assets?role=style_ref"), h.TeamA.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	items, _ = listOf(t, raw)
	require.Len(t, items, 1)
	require.Equal(t, "风格参考", items[0].(map[string]any)["name"])
}

func TestProjectAssetTeamIsolation(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	aid := createCharacter(t, h, h.TeamA.OwnerToken, "A队角色")
	resp, _ := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
		map[string]any{"asset_id": aid, "role": "character_ref"})
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	// TeamB 查同一 project → RLS 隔离, 看不到
	resp, raw := do(t, "GET", h.URL("/v1/projects/"+pid+"/assets?role=character_ref"), h.TeamB.OwnerToken, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode, "list teamB: %s", raw)
	items, _ := listOf(t, raw)
	require.Len(t, items, 0, "TeamB 不应看到 TeamA 的项目关联")
}

func TestViewerCannotLink(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	aid := createCharacter(t, h, h.TeamA.OwnerToken, "viewer测试")

	// viewer 是只读, 关联(写)应被拒
	resp, _ := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.ViewerToken,
		map[string]any{"asset_id": aid, "role": "character_ref"})
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestLinkInvalidRole(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	aid := createCharacter(t, h, h.TeamA.OwnerToken, "非法role")

	resp, raw := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
		map[string]any{"asset_id": aid, "role": "bogus_role"})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject bad role: %s", raw)
	require.Equal(t, "INVALID_INPUT", errCodeOf(t, raw))
}

func TestLinkInvalidAssetUUID(t *testing.T) {
	h := getH(t)
	pid := uuid.NewString()
	resp, _ := do(t, "POST", h.URL("/v1/projects/"+pid+"/assets"), h.TeamA.OwnerToken,
		map[string]any{"asset_id": "not-a-uuid", "role": "character_ref"})
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
