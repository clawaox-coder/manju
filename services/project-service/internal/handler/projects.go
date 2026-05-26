// Package handler 把 HTTP 请求映射到 service.Projects 上, 输出 api.md §3 风格的 JSON.

package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/manju-org/manju/services/project-service/internal/apperr"
	"github.com/manju-org/manju/services/project-service/internal/httpx"
	"github.com/manju-org/manju/services/project-service/internal/middleware"
	"github.com/manju-org/manju/services/project-service/internal/repo"
	"github.com/manju-org/manju/services/project-service/internal/service"
)

type Projects struct {
	Svc *service.Projects
}

// ---- DTO ----

type projectDTO struct {
	ID           string          `json:"id"`
	TeamID       string          `json:"team_id"`
	OwnerID      string          `json:"owner_id"`
	Name         string          `json:"name"`
	Genre        *string         `json:"genre"`
	Status       string          `json:"status"`
	Progress     int16           `json:"progress"`
	Version      string          `json:"version"`
	ThumbnailURL *string         `json:"thumbnail_url"`
	BgStyle      *string         `json:"bg_style"`
	Metadata     json.RawMessage `json:"metadata"`
	DeletedAt    *string         `json:"deleted_at"`
	CreatedAt    string          `json:"created_at"`
	UpdatedAt    string          `json:"updated_at"`
}

func toDTO(p *repo.Project) projectDTO {
	d := projectDTO{
		ID:           p.ID.String(),
		TeamID:       p.TeamID.String(),
		OwnerID:      p.OwnerID.String(),
		Name:         p.Name,
		Genre:        p.Genre,
		Status:       p.Status,
		Progress:     p.Progress,
		Version:      p.Version,
		ThumbnailURL: p.ThumbnailURL,
		BgStyle:      p.BgStyle,
		Metadata:     p.Metadata,
		CreatedAt:    p.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:    p.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if p.DeletedAt != nil {
		s := p.DeletedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		d.DeletedAt = &s
	}
	return d
}

func toDTOs(ps []repo.Project) []projectDTO {
	out := make([]projectDTO, 0, len(ps))
	for i := range ps {
		out = append(out, toDTO(&ps[i]))
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

// ---- projects (8 端点) ----

func (h *Projects) List(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pageSize, err := parsePageSize(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	q := r.URL.Query()
	lr, err := h.Svc.List(r.Context(), teamID, userID, service.ListInput{
		Status:   q.Get("status"),
		Genre:    q.Get("genre"),
		Q:        q.Get("q"),
		Cursor:   q.Get("cursor"),
		PageSize: pageSize,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	writeList(w, r, http.StatusOK, lr)
}

func (h *Projects) Get(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	p, err := h.Svc.Get(r.Context(), teamID, userID, id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(p))
}

type createReq struct {
	Name       string  `json:"name"`
	Genre      *string `json:"genre,omitempty"`
	From       string  `json:"from,omitempty"`
	TemplateID *string `json:"template_id,omitempty"`
}

func (h *Projects) Create(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())

	var body createReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	p, err := h.Svc.Create(r.Context(), teamID, userID, service.CreateInput{
		Name:       body.Name,
		Genre:      body.Genre,
		From:       body.From,
		TemplateID: body.TemplateID,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, toDTO(p))
}

// patch body: 用 raw map 检测字段是否出现 (genre 显式 null 与不传不同).
func (h *Projects) Patch(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
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
	in := service.PatchInput{}
	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("name 必须是 string"))
			return
		}
		in.Name = &s
	}
	if v, ok := raw["genre"]; ok {
		in.GenreTouched = true
		var s *string
		if err := json.Unmarshal(v, &s); err != nil {
			httpx.WriteError(w, r, apperr.InvalidInput("genre 必须是 string 或 null"))
			return
		}
		in.Genre = s
	}
	p, err := h.Svc.Patch(r.Context(), teamID, userID, id, in)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(p))
}

func (h *Projects) Duplicate(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	p, err := h.Svc.Duplicate(r.Context(), teamID, userID, id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, toDTO(p))
}

func (h *Projects) SoftDelete(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.SoftDelete(r.Context(), teamID, userID, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

func (h *Projects) Restore(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	p, err := h.Svc.Restore(r.Context(), teamID, userID, id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(p))
}

func (h *Projects) Purge(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.Purge(r.Context(), teamID, userID, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

// ---- drafts (3 端点) ----

func (h *Projects) ListDrafts(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pageSize, err := parsePageSize(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	lr, err := h.Svc.ListDrafts(r.Context(), teamID, userID, r.URL.Query().Get("cursor"), pageSize)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	writeList(w, r, http.StatusOK, lr)
}

func (h *Projects) DeleteDraft(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.DeleteDraft(r.Context(), teamID, userID, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

func (h *Projects) ClearAllDrafts(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	n, err := h.Svc.ClearAllDrafts(r.Context(), teamID, userID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, map[string]any{"removed": n})
}

// ---- shared (2 端点) ----

func (h *Projects) ListShared(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pageSize, err := parsePageSize(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	lr, err := h.Svc.ListShared(r.Context(), teamID, userID, r.URL.Query().Get("cursor"), pageSize)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	writeList(w, r, http.StatusOK, lr)
}

func (h *Projects) LeaveShared(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	id, err := parseID(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.LeaveShared(r.Context(), teamID, userID, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

// ---- trash (4 端点) ----

func (h *Projects) ListTrash(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	pageSize, err := parsePageSize(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	lr, err := h.Svc.ListTrash(r.Context(), teamID, userID, r.URL.Query().Get("cursor"), pageSize)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	writeList(w, r, http.StatusOK, lr)
}

func (h *Projects) RestoreFromTrash(w http.ResponseWriter, r *http.Request) {
	h.Restore(w, r) // 与 /v1/projects/:id/restore 等价
}

func (h *Projects) DeleteFromTrash(w http.ResponseWriter, r *http.Request) {
	h.Purge(w, r) // 与 /v1/projects/:id/purge 等价
}

func (h *Projects) EmptyTrash(w http.ResponseWriter, r *http.Request) {
	teamID := middleware.MustTeamID(r.Context())
	userID := middleware.MustUserID(r.Context())
	n, err := h.Svc.EmptyTrash(r.Context(), teamID, userID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, map[string]any{"removed": n})
}
