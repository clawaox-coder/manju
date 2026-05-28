// Package ffmpeg 把 ffmpeg 子进程调用包装成可测的 Renderer.
//
// 支持两种模式:
// 1. Shots 拼接: 下载各 shot 图片/视频 → concat demuxer → 输出视频
// 2. Fallback: 无 shots 时生成测试卡片 (lavfi color + drawtext)

package ffmpeg

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Renderer struct {
	Bin string
}

func New(bin string) *Renderer {
	if bin == "" {
		bin = "ffmpeg"
	}
	return &Renderer{Bin: bin}
}

type ShotInput struct {
	ID         string
	ImageURL   string // S3 presigned URL (图片 → 静帧视频)
	VideoURL   string // S3 presigned URL (已有视频片段)
	DurationMs int32  // 每个 shot 的时长
	Dialog     string // 字幕文本 (可选)
}

type RenderInput struct {
	JobID      string
	Resolution string
	Format     string
	WorkDir    string
	Title      string
	Shots      []ShotInput // 有 shots 时走 concat, 无则 fallback 测试卡片
}

type RenderOutput struct {
	VideoPath     string
	ThumbnailPath string
	DurationMs    int32
}

func resolutionSize(res string) string {
	switch res {
	case "1080p":
		return "1920x1080"
	case "2k":
		return "2560x1440"
	case "4k":
		return "3840x2160"
	}
	return "1280x720"
}

func (r *Renderer) Render(ctx context.Context, in RenderInput) (*RenderOutput, error) {
	if len(in.Shots) > 0 {
		return r.renderConcat(ctx, in)
	}
	return r.renderTestCard(ctx, in)
}

// renderConcat 下载各 shot 素材, 生成 concat demuxer, 拼接输出.
func (r *Renderer) renderConcat(ctx context.Context, in RenderInput) (*RenderOutput, error) {
	size := resolutionSize(in.Resolution)
	format := in.Format
	if format == "" {
		format = "mp4"
	}

	var totalMs int32
	var segments []string

	for i, shot := range in.Shots {
		dur := shot.DurationMs
		if dur <= 0 {
			dur = 3000
		}
		totalMs += dur
		durSec := fmt.Sprintf("%.3f", float64(dur)/1000.0)

		segPath := filepath.Join(in.WorkDir, fmt.Sprintf("seg_%03d.mp4", i))

		if shot.VideoURL != "" {
			if err := downloadFile(ctx, shot.VideoURL, segPath); err != nil {
				return nil, fmt.Errorf("download shot %d video: %w", i, err)
			}
		} else if shot.ImageURL != "" {
			imgPath := filepath.Join(in.WorkDir, fmt.Sprintf("img_%03d.jpg", i))
			if err := downloadFile(ctx, shot.ImageURL, imgPath); err != nil {
				return nil, fmt.Errorf("download shot %d image: %w", i, err)
			}
			// 图片 → 静帧视频片段
			args := []string{
				"-y", "-loop", "1", "-i", imgPath,
				"-c:v", "libx264", "-pix_fmt", "yuv420p",
				"-vf", fmt.Sprintf("scale=%s:force_original_aspect_ratio=decrease,pad=%s:(ow-iw)/2:(oh-ih)/2", size, size),
				"-t", durSec, "-preset", "ultrafast", segPath,
			}
			if err := runFFmpeg(ctx, r.Bin, args); err != nil {
				return nil, fmt.Errorf("image-to-video shot %d: %w", i, err)
			}
		} else {
			// 无素材: 生成纯色 + 文字占位
			title := sanitizeTitle(shot.Dialog)
			if title == "" {
				title = fmt.Sprintf("Shot %d", i+1)
			}
			args := []string{
				"-y", "-f", "lavfi",
				"-i", fmt.Sprintf("color=c=0x1a1a2e:s=%s:r=24:d=%s", size, durSec),
				"-vf", fmt.Sprintf("drawtext=fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='%s'", title),
				"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", segPath,
			}
			if err := runFFmpeg(ctx, r.Bin, args); err != nil {
				return nil, fmt.Errorf("placeholder shot %d: %w", i, err)
			}
		}
		segments = append(segments, segPath)
	}

	// 写 concat demuxer 文件
	concatPath := filepath.Join(in.WorkDir, "concat.txt")
	var concatContent strings.Builder
	for _, seg := range segments {
		concatContent.WriteString(fmt.Sprintf("file '%s'\n", seg))
	}
	if err := os.WriteFile(concatPath, []byte(concatContent.String()), 0o644); err != nil {
		return nil, fmt.Errorf("write concat.txt: %w", err)
	}

	// ffmpeg concat → 最终输出
	videoPath := filepath.Join(in.WorkDir, "output."+format)
	args := []string{
		"-y", "-f", "concat", "-safe", "0", "-i", concatPath,
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
		"-movflags", "+faststart", videoPath,
	}
	if err := runFFmpeg(ctx, r.Bin, args); err != nil {
		return nil, fmt.Errorf("concat: %w", err)
	}

	// thumbnail (第一帧)
	thumbPath := filepath.Join(in.WorkDir, "thumbnail.jpg")
	thumbArgs := []string{"-y", "-i", videoPath, "-vframes", "1", "-q:v", "3", thumbPath}
	if err := runFFmpeg(ctx, r.Bin, thumbArgs); err != nil {
		return nil, fmt.Errorf("extract thumbnail: %w", err)
	}

	return &RenderOutput{
		VideoPath:     videoPath,
		ThumbnailPath: thumbPath,
		DurationMs:    totalMs,
	}, nil
}

// renderTestCard fallback: 无 shots 时生成测试卡片.
func (r *Renderer) renderTestCard(ctx context.Context, in RenderInput) (*RenderOutput, error) {
	size := resolutionSize(in.Resolution)
	format := in.Format
	if format == "" {
		format = "mp4"
	}
	const durationSec = 5

	videoPath := filepath.Join(in.WorkDir, "output."+format)
	thumbPath := filepath.Join(in.WorkDir, "thumbnail.jpg")
	title := sanitizeTitle(in.Title)
	if title == "" {
		title = "manju render"
	}

	args := []string{
		"-y", "-f", "lavfi",
		"-i", fmt.Sprintf("color=c=black:s=%s:r=24:d=%d", size, durationSec),
		"-vf", fmt.Sprintf("drawtext=fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='%s'", title),
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
		"-t", fmt.Sprintf("%d", durationSec), videoPath,
	}
	if err := runFFmpeg(ctx, r.Bin, args); err != nil {
		return nil, fmt.Errorf("render mp4: %w", err)
	}

	thumbArgs := []string{"-y", "-i", videoPath, "-vframes", "1", "-q:v", "3", thumbPath}
	if err := runFFmpeg(ctx, r.Bin, thumbArgs); err != nil {
		return nil, fmt.Errorf("extract thumbnail: %w", err)
	}

	return &RenderOutput{
		VideoPath:     videoPath,
		ThumbnailPath: thumbPath,
		DurationMs:    int32(durationSec * 1000),
	}, nil
}

func runFFmpeg(ctx context.Context, bin string, args []string) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		tail := tailLines(string(out), 10)
		return fmt.Errorf("ffmpeg exit: %v; output:\n%s", err, tail)
	}
	return nil
}

func downloadFile(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: HTTP %d", url, resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func tailLines(s string, n int) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	if len(lines) <= n {
		return strings.Join(lines, "\n")
	}
	return strings.Join(lines[len(lines)-n:], "\n")
}

func sanitizeTitle(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == ' ' || r == '-':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	return b.String()
}
