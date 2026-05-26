// Package handler 把 HTTP 请求映射到 service 层, 输出 api.md §3 风格的 JSON.

package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/manju-org/manju/services/script-service/internal/apperr"
	"github.com/manju-org/manju/services/script-service/internal/httpx"
	"github.com/manju-org/manju/services/script-service/internal/middleware"
	"github.com/manju-org/manju/services/script-service/internal/repo"
	"github.com/manju-org/manju/services/script-service/internal/service"
)

// ---- DTOs ----

type scriptDTO struct {
	ProjectID  string  `json:"project_id"`
	Content    string  `json:"content"`
	Format     string  `json:"format"`
	WordCount  int32   `json:"word_count"`
	SceneCount int16   `json:"scene_count"`
	UpdatedBy  *string `json:"updated_by"`
	UpdatedAt  string  `json:"updated_at"`
	VersionNo  int32   `json:"version_no"`
}

func scriptToDTO(s *repo.Script) scriptDTO {
	d := scriptDTO{
		ProjectID:  s.ProjectID.String(),
		Content:    s.Content,
		Format:     s.Format,
		WordCount:  s.WordCount,
		SceneCount: s.SceneCount,
		UpdatedAt:  s.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		VersionNo:  s.VersionNo,
	}
	if s.UpdatedBy != nil {
		x := s.UpdatedBy.String()
		d.UpdatedBy = &x
	}
	return d
}

type versionDTO struct {
	ID            string          `json:"id"`
	ProjectID     string          `json:"project_id"`
	VersionNo     int32           `json:"version_no"`
	Content       string          `json:"content"`
	ShotsSnapshot json.RawMessage `json:"shots_snapshot"`
	WordCount     int32           `json:"word_count"`
	SceneCount    int16           `json:"scene_count"`
	SizeBytes     int32           `json:"size_bytes"`
	CreatedBy     *string         `json:"created_by"`
	CreatedAt     string          `json:"created_at"`
}

func versionToDTO(v *repo.ScriptVersion) versionDTO {
	d := versionDTO{
		ID:            v.ID.String(),
		ProjectID:     v.ProjectID.String(),
		VersionNo:     v.VersionNo,
		Content:       v.Content,
		ShotsSnapshot: v.ShotsSnapshot,
		WordCount:     v.WordCount,
		SceneCount:    v.SceneCount,
		SizeBytes:     v.SizeBytes,
		CreatedAt:     v.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if v.CreatedBy != nil {
		x := v.CreatedBy.String()
		d.CreatedBy = &x
	}
	return d
}

type versionSummaryDTO struct {
	ID         string  `json:"id"`
	ProjectID  string  `json:"project_id"`
	VersionNo  int32   `json:"version_no"`
	WordCount  int32   `json:"word_count"`
	SceneCount int16   `json:"scene_count"`
	SizeBytes  int32   `json:"size_bytes"`
	CreatedBy  *string `json:"created_by"`
	CreatedAt  string  `json:"created_at"`
}

// versionToSummary: list 端点用 summary, 不返 content (可能很大)
func versionToSummary(v *repo.ScriptVersion) versionSummaryDTO {
	d := versionSummaryDTO{
		ID:         v.ID.String(),
		ProjectID:  v.ProjectID.String(),
		VersionNo:  v.VersionNo,
		WordCount:  v.WordCount,
		SceneCount: v.SceneCount,
		SizeBytes:  v.SizeBytes,
		CreatedAt:  v.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if v.CreatedBy != nil {
		x := v.CreatedBy.String()
		d.CreatedBy = &x
	}
	return d
}

type shotDTO struct {
	ID         string          `json:"id"`
	ProjectID  string          `json:"project_id"`
	OrderIndex int32           `json:"order_index"`
	Num        *string         `json:"num"`
	Title      *string         `json:"title"`
	ShotType   *string         `json:"shot_type"`
	DurationMs int32           `json:"duration_ms"`
	Dialog     *string         `json:"dialog"`
	ImageURL   *string         `json:"image_url"`
	BgStyle    *string         `json:"bg_style"`
	VoiceID    *string         `json:"voice_id"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  string          `json:"created_at"`
	UpdatedAt  string          `json:"updated_at"`
}

func shotToDTO(s *repo.Shot) shotDTO {
	d := shotDTO{
		ID:         s.ID.String(),
		ProjectID:  s.ProjectID.String(),
		OrderIndex: s.OrderIndex,
		Num:        s.Num,
		Title:      s.Title,
		ShotType:   s.ShotType,
		DurationMs: s.DurationMs,
		Dialog:     s.Dialog,
		ImageURL:   s.ImageURL,
		BgStyle:    s.BgStyle,
		Metadata:   s.Metadata,
		CreatedAt:  s.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:  s.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if s.VoiceID != nil {
		x := s.VoiceID.String()
		d.VoiceID = &x
	}
	return d
}

func shotsToDTO(rows []repo.Shot) []shotDTO {
	out := make([]shotDTO, 0, len(rows))
	for i := range rows {
		out = append(out, shotToDTO(&rows[i]))
	}
	return out
}

// ---- helpers ----

func parseProjectID(r *http.Request) (uuid.UUID, error) {
	raw := chi.URLParam(r, "id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apperr.InvalidInput("id 不是合法 uuid").WithCause(err)
	}
	return id, nil
}

func parseShotID(r *http.Request) (uuid.UUID, error) {
	raw := chi.URLParam(r, "shot_id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apperr.InvalidInput("shot_id 不是合法 uuid").WithCause(err)
	}
	return id, nil
}

func parseVersionNo(r *http.Request) (int32, error) {
	raw := chi.URLParam(r, "version_no")
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 0, apperr.InvalidInput("version_no 必须是 >= 1 的整数")
	}
	return int32(n), nil
}

// ---- Scripts handler ----

type ScriptsHandler struct {
	Svc *service.Scripts
}

func (h *ScriptsHandler) Get(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	s, err := h.Svc.Get(r.Context(), teamID, userID, projectID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, scriptToDTO(s))
}

type putScriptReq struct {
	Content           string `json:"content"`
	ExpectedVersionNo int32  `json:"expected_version_no"`
}

func (h *ScriptsHandler) Put(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var body putScriptReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	s, err := h.Svc.Put(r.Context(), teamID, userID, projectID, service.PutScriptInput{
		Content:           body.Content,
		ExpectedVersionNo: body.ExpectedVersionNo,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, scriptToDTO(s))
}

func (h *ScriptsHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 && n <= 200 {
			limit = n
		} else {
			httpx.WriteError(w, r, apperr.InvalidInput("limit 需在 1-200 之间"))
			return
		}
	}
	vs, err := h.Svc.ListVersions(r.Context(), teamID, userID, projectID, limit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out := make([]versionSummaryDTO, 0, len(vs))
	for i := range vs {
		out = append(out, versionToSummary(&vs[i]))
	}
	// list 不分页 (m1 limit=200 内足够), 返简单 envelope
	httpx.WriteList(w, r, http.StatusOK, out, limit, false, nil)
}

func (h *ScriptsHandler) GetVersion(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	versionNo, err := parseVersionNo(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v, err := h.Svc.GetVersion(r.Context(), teamID, userID, projectID, versionNo)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, versionToDTO(v))
}

func (h *ScriptsHandler) Restore(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	versionNo, err := parseVersionNo(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	s, err := h.Svc.Restore(r.Context(), teamID, userID, projectID, versionNo)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, scriptToDTO(s))
}

// ---- Shots handler ----

type ShotsHandler struct {
	Svc *service.Shots
}

func (h *ShotsHandler) List(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	rows, err := h.Svc.List(r.Context(), teamID, userID, projectID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteList(w, r, http.StatusOK, shotsToDTO(rows), len(rows), false, nil)
}

type createShotReq struct {
	Title       *string `json:"title,omitempty"`
	ShotType    *string `json:"shot_type,omitempty"`
	DurationMs  *int32  `json:"duration_ms,omitempty"`
	Dialog      *string `json:"dialog,omitempty"`
	AfterShotID *string `json:"after_shot_id,omitempty"`
}

func (h *ShotsHandler) Create(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var body createShotReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var afterID *uuid.UUID
	if body.AfterShotID != nil && *body.AfterShotID != "" {
		id, err := uuid.Parse(*body.AfterShotID)
		if err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("after_shot_id 不是合法 uuid").WithCause(err))
			return
		}
		afterID = &id
	}
	s, err := h.Svc.Create(r.Context(), teamID, userID, projectID, service.CreateShotInput{
		Title:       body.Title,
		ShotType:    body.ShotType,
		DurationMs:  body.DurationMs,
		Dialog:      body.Dialog,
		AfterShotID: afterID,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, shotToDTO(s))
}

// PATCH shot 用 map[string]json.RawMessage 区分 unset/null. order_index 与 project_id 不可改.
func (h *ShotsHandler) Patch(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	shotID, err := parseShotID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var raw map[string]json.RawMessage
	if err := httpx.DecodeJSON(r, &raw); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	for _, k := range []string{"id", "project_id", "order_index", "created_at", "updated_at"} {
		if _, ok := raw[k]; ok {
			httpx.WriteError(w, r, apperr.InvalidInput("不允许通过 PATCH 修改 "+k))
			return
		}
	}

	set := repo.PatchShotSet{}
	if v, ok := raw["num"]; ok {
		set.NumTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("num 必须是 string 或 null"))
			return
		}
		set.Num = s
	}
	if v, ok := raw["title"]; ok {
		set.TitleTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("title 必须是 string 或 null"))
			return
		}
		set.Title = s
	}
	if v, ok := raw["shot_type"]; ok {
		set.ShotTypeTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("shot_type 必须是 string 或 null"))
			return
		}
		set.ShotType = s
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
	if v, ok := raw["dialog"]; ok {
		set.DialogTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("dialog 必须是 string 或 null"))
			return
		}
		set.Dialog = s
	}
	if v, ok := raw["image_url"]; ok {
		set.ImageURLTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("image_url 必须是 string 或 null"))
			return
		}
		set.ImageURL = s
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
	if v, ok := raw["voice_id"]; ok {
		set.VoiceIDTouch = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("voice_id 必须是 uuid 字符串或 null"))
			return
		}
		if s != nil {
			id, err := uuid.Parse(*s)
			if err != nil {
				httpx.WriteError(w, r, apperr.InvalidInput("voice_id 不是合法 uuid").WithCause(err))
				return
			}
			set.VoiceID = &id
		}
	}
	if v, ok := raw["metadata"]; ok {
		set.Metadata = v
	}

	s, err := h.Svc.Patch(r.Context(), teamID, userID, projectID, shotID, set)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, shotToDTO(s))
}

func (h *ShotsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	shotID, err := parseShotID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.Delete(r.Context(), teamID, userID, projectID, shotID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

type reorderReq struct {
	Order []string `json:"order"`
}

func (h *ShotsHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	projectID, err := parseProjectID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var body reorderReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	ids := make([]uuid.UUID, 0, len(body.Order))
	for _, raw := range body.Order {
		id, err := uuid.Parse(raw)
		if err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("order 含非法 uuid").WithDetail("got", raw))
			return
		}
		ids = append(ids, id)
	}
	rows, err := h.Svc.Reorder(r.Context(), teamID, userID, projectID, ids)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteList(w, r, http.StatusOK, shotsToDTO(rows), len(rows), false, nil)
}
