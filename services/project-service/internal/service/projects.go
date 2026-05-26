// Package service 串接 handler 与 repo, 集中输入校验.

package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"

	"github.com/manju-org/manju/services/project-service/internal/apperr"
	"github.com/manju-org/manju/services/project-service/internal/repo"
)

type Projects struct {
	Repo *repo.Projects
}

// ---- create ----

type CreateInput struct {
	Name       string
	Genre      *string
	From       string // script | idea | template (信息字段, 暂只记 metadata)
	TemplateID *string
}

func (s *Projects) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*repo.Project, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, apperr.InvalidInput("name 不能为空")
	}
	if len(name) > 200 {
		return nil, apperr.InvalidInput("name 不能超过 200 字符")
	}
	if in.Genre != nil && len(*in.Genre) > 50 {
		return nil, apperr.InvalidInput("genre 不能超过 50 字符")
	}

	meta := map[string]any{}
	if in.From != "" {
		meta["from"] = in.From
	}
	if in.TemplateID != nil && *in.TemplateID != "" {
		if _, err := uuid.Parse(*in.TemplateID); err != nil {
			return nil, apperr.InvalidInput("template_id 不是合法 uuid")
		}
		meta["templateId"] = *in.TemplateID
	}
	var metaRaw json.RawMessage
	if len(meta) > 0 {
		b, _ := json.Marshal(meta)
		metaRaw = b
	}

	return s.Repo.Create(ctx, teamID, userID, repo.CreateInput{
		Name:     name,
		Genre:    in.Genre,
		Metadata: metaRaw,
	})
}

// ---- update ----

type PatchInput struct {
	Name         *string
	Genre        *string
	GenreTouched bool
}

func (s *Projects) Patch(ctx context.Context, teamID, userID, id uuid.UUID, in PatchInput) (*repo.Project, error) {
	if in.Name == nil && !in.GenreTouched {
		return nil, apperr.InvalidInput("body 至少包含一个字段 (name / genre)")
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, apperr.InvalidInput("name 不能为空")
		}
		if len(n) > 200 {
			return nil, apperr.InvalidInput("name 不能超过 200 字符")
		}
		in.Name = &n
	}
	if in.GenreTouched && in.Genre != nil && len(*in.Genre) > 50 {
		return nil, apperr.InvalidInput("genre 不能超过 50 字符")
	}
	return s.Repo.Patch(ctx, teamID, userID, id, repo.PatchSet{
		Name:         in.Name,
		Genre:        in.Genre,
		GenreTouched: in.GenreTouched,
	})
}

// ---- straight-through ----

func (s *Projects) Get(ctx context.Context, teamID, userID, id uuid.UUID) (*repo.Project, error) {
	return s.Repo.GetByID(ctx, teamID, userID, id)
}

func (s *Projects) Duplicate(ctx context.Context, teamID, userID, id uuid.UUID) (*repo.Project, error) {
	return s.Repo.Duplicate(ctx, teamID, userID, id)
}

func (s *Projects) SoftDelete(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return s.Repo.SoftDelete(ctx, teamID, userID, id)
}

func (s *Projects) Restore(ctx context.Context, teamID, userID, id uuid.UUID) (*repo.Project, error) {
	return s.Repo.Restore(ctx, teamID, userID, id)
}

func (s *Projects) Purge(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return s.Repo.Purge(ctx, teamID, userID, id)
}

// ---- list ----

type ListInput struct {
	Status   string
	Genre    string
	Q        string
	Cursor   string
	PageSize int
	Scope    string
}

func (s *Projects) List(ctx context.Context, teamID, userID uuid.UUID, in ListInput) (*repo.ListResult, error) {
	if in.Status != "" {
		switch in.Status {
		case "draft", "rendering", "done", "archived":
		default:
			return nil, apperr.InvalidInput("status 不在允许值内")
		}
	}
	if len(in.Genre) > 50 {
		return nil, apperr.InvalidInput("genre 不能超过 50 字符")
	}
	if len(in.Q) > 200 {
		return nil, apperr.InvalidInput("q 不能超过 200 字符")
	}
	cur, err := repo.DecodeCursor(in.Cursor)
	if err != nil {
		return nil, err
	}
	return s.Repo.List(ctx, teamID, userID, repo.ListOpts{
		Status:   in.Status,
		Genre:    in.Genre,
		Q:        in.Q,
		Cursor:   cur,
		PageSize: in.PageSize,
		Scope:    in.Scope,
	})
}

func (s *Projects) ListDrafts(ctx context.Context, teamID, userID uuid.UUID, cursor string, pageSize int) (*repo.ListResult, error) {
	return s.List(ctx, teamID, userID, ListInput{
		Status:   "draft",
		Scope:    "mine",
		Cursor:   cursor,
		PageSize: pageSize,
	})
}

func (s *Projects) ClearAllDrafts(ctx context.Context, teamID, userID uuid.UUID) (int64, error) {
	return s.Repo.ClearAllDrafts(ctx, teamID, userID)
}

func (s *Projects) DeleteDraft(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return s.Repo.DeleteDraft(ctx, teamID, userID, id)
}

func (s *Projects) ListShared(ctx context.Context, teamID, userID uuid.UUID, cursor string, pageSize int) (*repo.ListResult, error) {
	cur, err := repo.DecodeCursor(cursor)
	if err != nil {
		return nil, err
	}
	return s.Repo.ListShared(ctx, teamID, userID, cur, pageSize)
}

func (s *Projects) LeaveShared(ctx context.Context, teamID, userID, projectID uuid.UUID) error {
	return s.Repo.LeaveShared(ctx, teamID, userID, projectID)
}

func (s *Projects) ListTrash(ctx context.Context, teamID, userID uuid.UUID, cursor string, pageSize int) (*repo.ListResult, error) {
	cur, err := repo.DecodeCursor(cursor)
	if err != nil {
		return nil, err
	}
	return s.Repo.ListTrash(ctx, teamID, userID, cur, pageSize)
}

func (s *Projects) EmptyTrash(ctx context.Context, teamID, userID uuid.UUID) (int64, error) {
	return s.Repo.EmptyTrash(ctx, teamID, userID)
}
