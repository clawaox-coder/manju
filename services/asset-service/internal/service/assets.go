// Package service 串接 handler 与 repo, 集中输入校验.

package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"

	"github.com/manju-org/manju/services/asset-service/internal/apperr"
	"github.com/manju-org/manju/services/asset-service/internal/repo"
	"github.com/manju-org/manju/services/asset-service/internal/s3util"
)

type Assets struct {
	Repo *repo.Assets
	S3   *s3util.Client
}

// ---- create ----

type CreateInput struct {
	Type         repo.AssetType
	Name         string
	Description  *string
	Tags         []string
	FileURL      *string
	ThumbnailURL *string
	BgStyle      *string
	Avatar       *string
	DurationMs   *int32
	Metadata     json.RawMessage
}

func (s *Assets) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*repo.Asset, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, apperr.InvalidInput("name 不能为空")
	}
	if len(name) > 100 {
		return nil, apperr.InvalidInput("name 不能超过 100 字符")
	}
	if in.BgStyle != nil && len(*in.BgStyle) > 50 {
		return nil, apperr.InvalidInput("bg_style 不能超过 50 字符")
	}
	if in.Avatar != nil && len([]rune(*in.Avatar)) > 10 {
		return nil, apperr.InvalidInput("avatar 不能超过 10 字符")
	}
	if in.DurationMs != nil && *in.DurationMs < 0 {
		return nil, apperr.InvalidInput("duration_ms 必须非负")
	}
	if len(in.Tags) > 50 {
		return nil, apperr.InvalidInput("tags 数量不能超过 50")
	}

	return s.Repo.Create(ctx, teamID, userID, repo.CreateInput{
		Type:         in.Type,
		Name:         name,
		Description:  in.Description,
		Tags:         in.Tags,
		FileURL:      in.FileURL,
		ThumbnailURL: in.ThumbnailURL,
		BgStyle:      in.BgStyle,
		Avatar:       in.Avatar,
		DurationMs:   in.DurationMs,
		Metadata:     in.Metadata,
	})
}

// ---- get / delete ----

func (s *Assets) Get(ctx context.Context, teamID, userID uuid.UUID, t repo.AssetType, id uuid.UUID) (*repo.Asset, error) {
	return s.Repo.GetByID(ctx, teamID, userID, t, id)
}

func (s *Assets) SoftDelete(ctx context.Context, teamID, userID uuid.UUID, t repo.AssetType, id uuid.UUID) error {
	return s.Repo.SoftDelete(ctx, teamID, userID, t, id)
}

// ---- patch ----

func (s *Assets) Patch(ctx context.Context, teamID, userID uuid.UUID, t repo.AssetType, id uuid.UUID, set repo.PatchSet) (*repo.Asset, error) {
	if set.Name != nil {
		n := strings.TrimSpace(*set.Name)
		if n == "" {
			return nil, apperr.InvalidInput("name 不能为空")
		}
		if len(n) > 100 {
			return nil, apperr.InvalidInput("name 不能超过 100 字符")
		}
		set.Name = &n
	}
	if set.BgStyleTouch && set.BgStyle != nil && len(*set.BgStyle) > 50 {
		return nil, apperr.InvalidInput("bg_style 不能超过 50 字符")
	}
	if set.AvatarTouch && set.Avatar != nil && len([]rune(*set.Avatar)) > 10 {
		return nil, apperr.InvalidInput("avatar 不能超过 10 字符")
	}
	if set.DurationMsTouch && set.DurationMs != nil && *set.DurationMs < 0 {
		return nil, apperr.InvalidInput("duration_ms 必须非负")
	}
	if set.TagsTouched && len(set.Tags) > 50 {
		return nil, apperr.InvalidInput("tags 数量不能超过 50")
	}
	return s.Repo.Patch(ctx, teamID, userID, t, id, set)
}

// ---- list ----

type ListInput struct {
	Q        string
	Tags     []string
	Cursor   string
	PageSize int
}

func (s *Assets) List(ctx context.Context, teamID, userID uuid.UUID, t repo.AssetType, in ListInput) (*repo.ListResult, error) {
	if len(in.Q) > 200 {
		return nil, apperr.InvalidInput("q 不能超过 200 字符")
	}
	if len(in.Tags) > 20 {
		return nil, apperr.InvalidInput("tags 过滤项不能超过 20 个")
	}
	cur, err := repo.DecodeCursor(in.Cursor)
	if err != nil {
		return nil, err
	}
	return s.Repo.List(ctx, teamID, userID, t, repo.ListOpts{
		Type:     t,
		Q:        in.Q,
		Tags:     in.Tags,
		Cursor:   cur,
		PageSize: in.PageSize,
	})
}

// ---- upload presign ----

type SignUploadInput struct {
	Filename    string
	ContentType string
	SizeBytes   int64
	Purpose     string
	AssetType   string // 可选, 当作 key 前缀; 不限制必须是 enum 内值
}

const maxUploadBytes = 500 * 1024 * 1024 // 500 MB

func (s *Assets) SignUpload(ctx context.Context, teamID uuid.UUID, in SignUploadInput) (*s3util.SignResult, error) {
	if strings.TrimSpace(in.Filename) == "" {
		return nil, apperr.InvalidInput("filename 不能为空")
	}
	if len(in.Filename) > 255 {
		return nil, apperr.InvalidInput("filename 过长")
	}
	if strings.TrimSpace(in.ContentType) == "" {
		return nil, apperr.InvalidInput("content_type 不能为空")
	}
	if in.SizeBytes <= 0 {
		return nil, apperr.InvalidInput("size_bytes 必须 > 0")
	}
	if in.SizeBytes > maxUploadBytes {
		return nil, apperr.InvalidInput("文件超过 500MB 上限")
	}
	if strings.TrimSpace(in.Purpose) == "" {
		return nil, apperr.InvalidInput("purpose 不能为空")
	}

	res, err := s.S3.PresignPut(ctx, s3util.SignInput{
		Filename:    in.Filename,
		ContentType: in.ContentType,
		SizeBytes:   in.SizeBytes,
		TeamID:      teamID,
		AssetType:   in.AssetType,
	})
	if err != nil {
		return nil, apperr.UploadFailed("生成上传 URL 失败").WithCause(err)
	}
	return res, nil
}

// ---- project_assets (项目 ↔ 资产关联, role 区分用途) ----

// 允许的关联用途. 后续新增剧本/分镜/风格参考时在此扩展.
var validRoles = map[string]bool{
	"character_ref": true,
	"style_ref":     true,
	"script_ref":    true,
}

func (s *Assets) LinkProjectAsset(ctx context.Context, teamID, userID, projectID, assetID uuid.UUID, role string) error {
	if !validRoles[role] {
		return apperr.InvalidInput("role 不在允许范围 (character_ref/style_ref/script_ref)")
	}
	return s.Repo.LinkAsset(ctx, teamID, userID, projectID, assetID, role)
}

func (s *Assets) UnlinkProjectAsset(ctx context.Context, teamID, userID, projectID, assetID uuid.UUID, role string) error {
	if !validRoles[role] {
		return apperr.InvalidInput("role 不在允许范围")
	}
	return s.Repo.UnlinkAsset(ctx, teamID, userID, projectID, assetID, role)
}

// ListProjectAssets 按 (project, role) 列出关联资产. role 为空时默认 character_ref.
func (s *Assets) ListProjectAssets(ctx context.Context, teamID, userID, projectID uuid.UUID, role string) ([]repo.Asset, error) {
	if role == "" {
		role = "character_ref"
	}
	if !validRoles[role] {
		return nil, apperr.InvalidInput("role 不在允许范围")
	}
	return s.Repo.ListByProjectRole(ctx, teamID, userID, projectID, role)
}
