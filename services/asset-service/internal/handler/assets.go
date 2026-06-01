// Package handler 把 HTTP 请求映射到 service.Assets 上, 输出 api.md §3 风格的 JSON.

package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/manju-org/manju/services/asset-service/internal/apperr"
	"github.com/manju-org/manju/services/asset-service/internal/httpx"
	"github.com/manju-org/manju/services/asset-service/internal/middleware"
	"github.com/manju-org/manju/services/asset-service/internal/repo"
	"github.com/manju-org/manju/services/asset-service/internal/service"
)

type Assets struct {
	Svc *service.Assets
}

// ---- DTO ----

type assetDTO struct {
	ID           string          `json:"id"`
	TeamID       *string         `json:"team_id"`
	Type         string          `json:"type"`
	Name         string          `json:"name"`
	Description  *string         `json:"description"`
	Tags         []string        `json:"tags"`
	FileURL      *string         `json:"file_url"`
	ThumbnailURL *string         `json:"thumbnail_url"`
	BgStyle      *string         `json:"bg_style"`
	Avatar       *string         `json:"avatar"`
	DurationMs   *int32          `json:"duration_ms"`
	UsesCount    int32           `json:"uses_count"`
	CreatedBy    *string         `json:"created_by"`
	Metadata     json.RawMessage `json:"metadata"`
	CreatedAt    string          `json:"created_at"`
	UpdatedAt    string          `json:"updated_at"`
	DeletedAt    *string         `json:"deleted_at"`
}

func toDTO(a *repo.Asset) assetDTO {
	d := assetDTO{
		ID:           a.ID.String(),
		Type:         string(a.Type),
		Name:         a.Name,
		Description:  a.Description,
		Tags:         a.Tags,
		FileURL:      a.FileURL,
		ThumbnailURL: a.ThumbnailURL,
		BgStyle:      a.BgStyle,
		Avatar:       a.Avatar,
		DurationMs:   a.DurationMs,
		UsesCount:    a.UsesCount,
		Metadata:     a.Metadata,
		CreatedAt:    a.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:    a.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if a.TeamID != nil {
		s := a.TeamID.String()
		d.TeamID = &s
	}
	if a.CreatedBy != nil {
		s := a.CreatedBy.String()
		d.CreatedBy = &s
	}
	if a.DeletedAt != nil {
		s := a.DeletedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		d.DeletedAt = &s
	}
	if d.Tags == nil {
		d.Tags = []string{}
	}
	return d
}

func toDTOs(as []repo.Asset) []assetDTO {
	out := make([]assetDTO, 0, len(as))
	for i := range as {
		out = append(out, toDTO(&as[i]))
	}
	return out
}

// ---- helpers ----

func parseID(r *http.Request) (uuid.UUID, error) {
	raw := chi.URLParam(r, "id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apperr.InvalidInput("id 不是合法 uuid").WithCause(err)
	}
	return id, nil
}

func parseType(r *http.Request) (repo.AssetType, error) {
	raw := chi.URLParam(r, "type")
	t, ok := repo.ParseAssetTypeFromPath(raw)
	if !ok {
		return "", apperr.InvalidInput("type 不在 characters/scenes/props/music/sfx/voices 之内").
			WithDetail("got", raw)
	}
	return t, nil
}

func parsePageSize(r *http.Request) (int, error) {
	raw := r.URL.Query().Get("page_size")
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || n > 100 {
		return 0, apperr.InvalidInput("page_size 需在 1-100 之间")
	}
	return n, nil
}

func writeList(w http.ResponseWriter, r *http.Request, status int, lr *repo.ListResult) {
	var nextStr *string
	if lr.NextCursor != nil {
		s := repo.EncodeCursor(lr.NextCursor)
		nextStr = &s
	}
	httpx.WriteList(w, r, status, toDTOs(lr.Items), lr.PageSize, lr.HasMore, nextStr)
}

// ---- assets CRUD (5 端点) ----

func (h *Assets) List(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	t, err := parseType(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	pageSize, err := parsePageSize(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	q := r.URL.Query()
	var tags []string
	if raw := q.Get("tags"); raw != "" {
		for _, t := range strings.Split(raw, ",") {
			if s := strings.TrimSpace(t); s != "" {
				tags = append(tags, s)
			}
		}
	}
	lr, err := h.Svc.List(r.Context(), teamID, userID, t, service.ListInput{
		Q:        q.Get("q"),
		Tags:     tags,
		Cursor:   q.Get("cursor"),
		PageSize: pageSize,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	writeList(w, r, http.StatusOK, lr)
}

func (h *Assets) Get(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	t, err := parseType(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	a, err := h.Svc.Get(r.Context(), teamID, userID, t, id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(a))
}

type createReq struct {
	Name         string          `json:"name"`
	Description  *string         `json:"description,omitempty"`
	Tags         []string        `json:"tags,omitempty"`
	FileURL      *string         `json:"file_url,omitempty"`
	ThumbnailURL *string         `json:"thumbnail_url,omitempty"`
	BgStyle      *string         `json:"bg_style,omitempty"`
	Avatar       *string         `json:"avatar,omitempty"`
	DurationMs   *int32          `json:"duration_ms,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
}

func (h *Assets) Create(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	t, err := parseType(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var body createReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	a, err := h.Svc.Create(r.Context(), teamID, userID, service.CreateInput{
		Type:         t,
		Name:         body.Name,
		Description:  body.Description,
		Tags:         body.Tags,
		FileURL:      body.FileURL,
		ThumbnailURL: body.ThumbnailURL,
		BgStyle:      body.BgStyle,
		Avatar:       body.Avatar,
		DurationMs:   body.DurationMs,
		Metadata:     body.Metadata,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, toDTO(a))
}

// PATCH 用 map[string]json.RawMessage 区分 "未给" 与 "显式 null"
// (与 project-service Patch 同套, 见 manju-next-slice memory §6).
func (h *Assets) Patch(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	t, err := parseType(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var raw map[string]json.RawMessage
	if err := httpx.DecodeJSON(r, &raw); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	set := repo.PatchSet{}
	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("name 必须是 string"))
			return
		}
		set.Name = &s
	}
	if v, ok := raw["description"]; ok {
		set.DescriptionTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("description 必须是 string 或 null"))
			return
		}
		set.Description = s
	}
	if v, ok := raw["tags"]; ok {
		set.TagsTouched = true
		var tags []string
		if err := json.Unmarshal(v, &tags); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("tags 必须是 string[]"))
			return
		}
		set.Tags = tags
	}
	if v, ok := raw["file_url"]; ok {
		set.FileURLTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("file_url 必须是 string 或 null"))
			return
		}
		set.FileURL = s
	}
	if v, ok := raw["thumbnail_url"]; ok {
		set.ThumbnailURLTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("thumbnail_url 必须是 string 或 null"))
			return
		}
		set.ThumbnailURL = s
	}
	if v, ok := raw["bg_style"]; ok {
		set.BgStyleTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("bg_style 必须是 string 或 null"))
			return
		}
		set.BgStyle = s
	}
	if v, ok := raw["avatar"]; ok {
		set.AvatarTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("avatar 必须是 string 或 null"))
			return
		}
		set.Avatar = s
	}
	if v, ok := raw["duration_ms"]; ok {
		set.DurationMsTouch = true
		var n *int32
		if err := json.Unmarshal(v, &n); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("duration_ms 必须是整数或 null"))
			return
		}
		set.DurationMs = n
	}
	if v, ok := raw["metadata"]; ok {
		set.Metadata = v
	}
	if _, ok := raw["type"]; ok {
		httpx.WriteError(w, r, apperr.InvalidInput("不允许通过 PATCH 修改 type"))
		return
	}

	a, err := h.Svc.Patch(r.Context(), teamID, userID, t, id, set)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(a))
}

func (h *Assets) Delete(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	t, err := parseType(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.SoftDelete(r.Context(), teamID, userID, t, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

// ---- upload sign (1 端点) ----

type signReq struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	Purpose     string `json:"purpose"`
	AssetType   string `json:"asset_type,omitempty"`
}

func (h *Assets) SignUpload(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	var body signReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	res, err := h.Svc.SignUpload(r.Context(), teamID, service.SignUploadInput{
		Filename:    body.Filename,
		ContentType: body.ContentType,
		SizeBytes:   body.SizeBytes,
		Purpose:     body.Purpose,
		AssetType:   body.AssetType,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, res)
}

// ---- project_assets (项目 ↔ 资产关联) ----

func parseProjectID(r *http.Request) (uuid.UUID, error) {
	raw := chi.URLParam(r, "pid")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apperr.InvalidInput("project id 不是合法 uuid").WithCause(err)
	}
	return id, nil
}

type linkReq struct {
	AssetID string `json:"asset_id"`
	Role    string `json:"role"`
}

// POST /v1/projects/{pid}/assets — 关联一个资产到项目 (body: asset_id, role)
func (h *Assets) LinkProjectAsset(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pid, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var body linkReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	assetID, err := uuid.Parse(body.AssetID)
	if err != nil {
		httpx.WriteError(w, r, apperr.InvalidInput("asset_id 不是合法 uuid"))
		return
	}
	if err := h.Svc.LinkProjectAsset(r.Context(), teamID, userID, pid, assetID, body.Role); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, map[string]string{
		"project_id": pid.String(), "asset_id": assetID.String(), "role": body.Role,
	})
}

// GET /v1/projects/{pid}/assets?role= — 列出项目下某 role 的关联资产
func (h *Assets) ListProjectAssets(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pid, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	role := r.URL.Query().Get("role")
	assets, err := h.Svc.ListProjectAssets(r.Context(), teamID, userID, pid, role)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTOs(assets))
}
