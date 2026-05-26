// Package handler 装配 HTTP 路由到 service 层. 4 端点对齐 api.md §7.5.

package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/manju-org/manju/services/render-service/internal/apperr"
	"github.com/manju-org/manju/services/render-service/internal/httpx"
	rmw "github.com/manju-org/manju/services/render-service/internal/middleware"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/service"
)

type Jobs struct {
	Svc *service.Jobs
}

// ---- DTO ----

type jobDTO struct {
	ID             string  `json:"id"`
	TeamID         string  `json:"team_id"`
	ProjectID      string  `json:"project_id"`
	UserID         string  `json:"user_id"`
	Status         string  `json:"status"`
	Progress       int16   `json:"progress"`
	Stage          *string `json:"stage,omitempty"`
	Priority       int16   `json:"priority"`
	Preset         *string `json:"preset,omitempty"`
	Resolution     *string `json:"resolution,omitempty"`
	Format         *string `json:"format,omitempty"`
	ResultURL      *string `json:"result_url,omitempty"`
	ThumbnailURL   *string `json:"thumbnail_url,omitempty"`
	SizeBytes      *int64  `json:"size_bytes,omitempty"`
	DurationMs    *int32  `json:"duration_ms,omitempty"`
	Error          *string `json:"error,omitempty"`
	WorkerID       *string `json:"worker_id,omitempty"`
	Attempt        int16   `json:"attempt"`
	IdempotencyKey *string `json:"idempotency_key,omitempty"`
	QueuedAt       string  `json:"queued_at"`
	StartedAt      *string `json:"started_at,omitempty"`
	DoneAt         *string `json:"done_at,omitempty"`
}

func toDTO(j *repo.Job) jobDTO {
	out := jobDTO{
		ID:             j.ID.String(),
		TeamID:         j.TeamID.String(),
		ProjectID:      j.ProjectID.String(),
		UserID:         j.UserID.String(),
		Status:         string(j.Status),
		Progress:       j.Progress,
		Stage:          j.Stage,
		Priority:       j.Priority,
		Preset:         j.Preset,
		Resolution:     j.Resolution,
		Format:         j.Format,
		ResultURL:      j.ResultURL,
		ThumbnailURL:   j.ThumbnailURL,
		SizeBytes:      j.SizeBytes,
		DurationMs:     j.DurationMs,
		Error:          j.Error,
		WorkerID:       j.WorkerID,
		Attempt:        j.Attempt,
		IdempotencyKey: j.IdempotencyKey,
		QueuedAt:       j.QueuedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if j.StartedAt != nil {
		s := j.StartedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		out.StartedAt = &s
	}
	if j.DoneAt != nil {
		s := j.DoneAt.UTC().Format("2006-01-02T15:04:05.000Z")
		out.DoneAt = &s
	}
	return out
}

// ---- POST /v1/render ----

type createReq struct {
	ProjectID       string `json:"project_id"`
	Resolution      string `json:"resolution"`
	Format          string `json:"format"`
	Preset          string `json:"preset,omitempty"`
	IncludeSubtitle bool   `json:"include_subtitle,omitempty"`
	Watermark       bool   `json:"watermark,omitempty"`
}

type createResp struct {
	JobID            string `json:"job_id"`
	Status           string `json:"status"`
	EstimatedSeconds int    `json:"estimated_seconds"`
	QueuePosition    int    `json:"queue_position"`
}

func (h *Jobs) Create(w http.ResponseWriter, r *http.Request) {
	var body createReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	teamID := rmw.MustTeamID(r.Context())
	userID := rmw.MustUserID(r.Context())
	// plan 通常应从 billing-service 拉, m1 简化: 默认 'free'. 上线前接 plan 缓存.
	plan := "free"
	idem := r.Header.Get("Idempotency-Key")

	out, err := h.Svc.Create(r.Context(), teamID, userID, service.CreateInput{
		ProjectID:       body.ProjectID,
		Resolution:      body.Resolution,
		Format:          body.Format,
		Preset:          body.Preset,
		IncludeSubtitle: body.IncludeSubtitle,
		Watermark:       body.Watermark,
		PlanTier:        plan,
		IdempotencyKey:  idem,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	status := http.StatusCreated
	if !out.Created {
		// idempotency 命中 — 返 200 (api.md §11 幂等性约定: 同 key 返同结果, 200).
		status = http.StatusOK
	}
	httpx.WriteJSON(w, r, status, createResp{
		JobID:            out.Job.ID.String(),
		Status:           string(out.Job.Status),
		EstimatedSeconds: out.EstimateS,
		QueuePosition:    out.QueuePos,
	})
}

// ---- GET /v1/render/:id ----

func (h *Jobs) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	teamID := rmw.MustTeamID(r.Context())
	userID := rmw.MustUserID(r.Context())
	j, err := h.Svc.Get(r.Context(), teamID, userID, id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toDTO(j))
}

// ---- DELETE /v1/render/:id ----

func (h *Jobs) Cancel(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	teamID := rmw.MustTeamID(r.Context())
	userID := rmw.MustUserID(r.Context())
	if err := h.Svc.Cancel(r.Context(), teamID, userID, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteNoContent(w, r)
}

// ---- GET /v1/render?project_id=&cursor=&page_size= ----

func (h *Jobs) List(w http.ResponseWriter, r *http.Request) {
	teamID := rmw.MustTeamID(r.Context())
	userID := rmw.MustUserID(r.Context())
	q := r.URL.Query()
	pageSize := 50
	if s := q.Get("page_size"); s != "" {
		// 不严格校验; service 层 cap 200
		var n int
		for _, ch := range s {
			if ch < '0' || ch > '9' {
				n = 0
				break
			}
			n = n*10 + int(ch-'0')
		}
		if n > 0 {
			pageSize = n
		}
	}
	res, err := h.Svc.List(r.Context(), teamID, userID, service.ListInput{
		ProjectID: q.Get("project_id"),
		Cursor:    q.Get("cursor"),
		PageSize:  pageSize,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	items := make([]jobDTO, 0, len(res.Items))
	for i := range res.Items {
		items = append(items, toDTO(&res.Items[i]))
	}
	var next *string
	if res.NextCursor != nil {
		s := repo.EncodeCursor(*res.NextCursor)
		next = &s
	}
	httpx.WriteList(w, r, http.StatusOK, items, res.PageSize, res.HasMore, next)
}

func parseID(s string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, apperr.InvalidInput("id 不是合法 UUID").WithCause(err)
	}
	return id, nil
}
