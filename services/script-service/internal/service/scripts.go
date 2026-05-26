// Package service 串接 handler 与 repo, 集中业务校验.
// 这里包含 script content 的字数 / 场景数计算 — 算法与 TS 版一致 (CJK 字符 + 空白分词的英文词).

package service

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/manju-org/manju/services/script-service/internal/apperr"
	"github.com/manju-org/manju/services/script-service/internal/repo"
)

const (
	maxScriptContentBytes = 5 * 1024 * 1024 // 5 MB 上限
	maxShotTitleLen       = 200
	maxShotDialogLen      = 5000
)

// ---- scripts ----

type Scripts struct {
	Repo     *repo.Scripts
	Versions *repo.ScriptVersions
	Shots    *repo.Shots
}

func (s *Scripts) Get(ctx context.Context, teamID, userID, projectID uuid.UUID) (*repo.Script, error) {
	return s.Repo.GetOrCreate(ctx, teamID, userID, projectID)
}

type PutScriptInput struct {
	Content           string
	ExpectedVersionNo int32
}

// Put: 计算 metric + 取当前 shots snapshot + 调 repo. 触发乐观锁与历史快照写入.
func (s *Scripts) Put(ctx context.Context, teamID, userID, projectID uuid.UUID, in PutScriptInput) (*repo.Script, error) {
	if utf8.RuneCountInString(in.Content) > maxScriptContentBytes {
		return nil, apperr.InvalidInput("content 超过 5MB 上限")
	}
	if in.ExpectedVersionNo < 1 {
		return nil, apperr.InvalidInput("expected_version_no 必须 >= 1")
	}

	// 先确保 scripts 行存在 (兼容首次 PUT 而未先 GET 的客户端)
	if _, err := s.Repo.GetOrCreate(ctx, teamID, userID, projectID); err != nil {
		return nil, err
	}

	// 收集当前 shots, 序列化进 snapshot (脱敏只取关键字段)
	shotsRows, err := s.Shots.List(ctx, teamID, userID, projectID)
	if err != nil {
		return nil, err
	}
	snapshot := shotsToSnapshot(shotsRows)

	comp := repo.PutComputed{
		WordCount:     int32(countWords(in.Content)),
		SceneCount:    int16(countScenes(in.Content)),
		SizeBytes:     int32(len(in.Content)),
		ShotsSnapshot: snapshot,
		// Delta nil — collab 切片才填
	}

	return s.Repo.Put(ctx, teamID, userID, projectID, repo.PutScriptInput{
		Content:           in.Content,
		ExpectedVersionNo: in.ExpectedVersionNo,
	}, comp)
}

// Restore: 拿老版本 content 当成新内容 PUT (生成更高版本号). 不修改 shots.
func (s *Scripts) Restore(ctx context.Context, teamID, userID, projectID uuid.UUID, versionNo int32) (*repo.Script, error) {
	v, err := s.Versions.GetByNo(ctx, teamID, userID, projectID, versionNo)
	if err != nil {
		return nil, err
	}
	// 拿当前 version_no 当 expected
	cur, err := s.Repo.GetOrCreate(ctx, teamID, userID, projectID)
	if err != nil {
		return nil, err
	}
	return s.Put(ctx, teamID, userID, projectID, PutScriptInput{
		Content:           v.Content,
		ExpectedVersionNo: cur.VersionNo,
	})
}

// ---- script_versions list / get ----

func (s *Scripts) ListVersions(ctx context.Context, teamID, userID, projectID uuid.UUID, limit int) ([]repo.ScriptVersion, error) {
	return s.Versions.List(ctx, teamID, userID, projectID, limit)
}

func (s *Scripts) GetVersion(ctx context.Context, teamID, userID, projectID uuid.UUID, versionNo int32) (*repo.ScriptVersion, error) {
	return s.Versions.GetByNo(ctx, teamID, userID, projectID, versionNo)
}

// ---- shots ----

type Shots struct {
	Repo *repo.Shots
}

func (s *Shots) List(ctx context.Context, teamID, userID, projectID uuid.UUID) ([]repo.Shot, error) {
	return s.Repo.List(ctx, teamID, userID, projectID)
}

type CreateShotInput struct {
	Title       *string
	ShotType    *string
	DurationMs  *int32
	Dialog      *string
	AfterShotID *uuid.UUID
}

func (s *Shots) Create(ctx context.Context, teamID, userID, projectID uuid.UUID, in CreateShotInput) (*repo.Shot, error) {
	if in.Title != nil {
		if len(*in.Title) > maxShotTitleLen {
			return nil, apperr.InvalidInput("title 不能超过 200 字符")
		}
	}
	if in.Dialog != nil && len(*in.Dialog) > maxShotDialogLen {
		return nil, apperr.InvalidInput("dialog 不能超过 5000 字符")
	}
	if in.DurationMs != nil && *in.DurationMs < 0 {
		return nil, apperr.InvalidInput("duration_ms 必须非负")
	}

	return s.Repo.Insert(ctx, teamID, userID, projectID, repo.CreateShotInput{
		Title:       in.Title,
		ShotType:    in.ShotType,
		DurationMs:  in.DurationMs,
		Dialog:      in.Dialog,
		AfterShotID: in.AfterShotID,
	})
}

func (s *Shots) Patch(ctx context.Context, teamID, userID, projectID, shotID uuid.UUID, set repo.PatchShotSet) (*repo.Shot, error) {
	if set.TitleTouch && set.Title != nil && len(*set.Title) > maxShotTitleLen {
		return nil, apperr.InvalidInput("title 不能超过 200 字符")
	}
	if set.DialogTouch && set.Dialog != nil && len(*set.Dialog) > maxShotDialogLen {
		return nil, apperr.InvalidInput("dialog 不能超过 5000 字符")
	}
	if set.DurationMsTouch && set.DurationMs != nil && *set.DurationMs < 0 {
		return nil, apperr.InvalidInput("duration_ms 必须非负")
	}
	return s.Repo.Patch(ctx, teamID, userID, projectID, shotID, set)
}

func (s *Shots) Delete(ctx context.Context, teamID, userID, projectID, shotID uuid.UUID) error {
	return s.Repo.Delete(ctx, teamID, userID, projectID, shotID)
}

func (s *Shots) Reorder(ctx context.Context, teamID, userID, projectID uuid.UUID, ids []uuid.UUID) ([]repo.Shot, error) {
	return s.Repo.Reorder(ctx, teamID, userID, projectID, ids)
}

// ---- helpers ----

// countWords: 中文字符数 + 空白分词后非空英文词数. 与 TS 版语义对齐.
func countWords(content string) int {
	if content == "" {
		return 0
	}
	cjk := 0
	for _, r := range content {
		if isCJK(r) {
			cjk++
		}
	}
	// 去掉 CJK 字符后按空白切分计英文词
	noCJK := removeCJK(content)
	englishWords := 0
	for _, w := range strings.Fields(noCJK) {
		if strings.TrimSpace(w) != "" {
			englishWords++
		}
	}
	return cjk + englishWords
}

// countScenes: markdown 中以 "## " 开头的行数 (二级标题视为一场)
func countScenes(content string) int {
	if content == "" {
		return 0
	}
	scenes := 0
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "## ") {
			scenes++
		}
	}
	return scenes
}

// isCJK: 粗略覆盖中日韩统一表意文字 (U+4E00..U+9FFF)
func isCJK(r rune) bool {
	return r >= 0x4E00 && r <= 0x9FFF
}

var cjkRangeRe = regexp.MustCompile(`[\x{4E00}-\x{9FFF}]+`)

func removeCJK(s string) string {
	return cjkRangeRe.ReplaceAllString(s, " ")
}

// shotsToSnapshot: 序列化关键字段进版本快照 jsonb. 不含全量字段, 避免快照过大.
type shotSnap struct {
	ID         string  `json:"id"`
	OrderIndex int32   `json:"order_index"`
	Title      *string `json:"title,omitempty"`
	ShotType   *string `json:"shot_type,omitempty"`
	DurationMs int32   `json:"duration_ms"`
}

func shotsToSnapshot(rows []repo.Shot) json.RawMessage {
	out := make([]shotSnap, 0, len(rows))
	for _, s := range rows {
		out = append(out, shotSnap{
			ID:         s.ID.String(),
			OrderIndex: s.OrderIndex,
			Title:      s.Title,
			ShotType:   s.ShotType,
			DurationMs: s.DurationMs,
		})
	}
	b, _ := json.Marshal(out)
	return b
}
