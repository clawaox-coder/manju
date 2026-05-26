// Package ffmpeg 把 ffmpeg 子进程调用包装成可测的 Renderer.
//
// m1 简化: 不读 shots 表, 用 lavfi color + drawtext 生成 5s 720p 测试卡片视频.
// 这把"worker → ffmpeg → s3" 整条链路打通, 后续 m2 替换 input 为真实
// shots 素材即可 (concat demuxer + 各 shot 时长 + bgm 混合 + 字幕 burnin).

package ffmpeg

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

type Renderer struct {
	Bin string // 默认 ffmpeg (PATH lookup), docker 镜像里给 /usr/bin/ffmpeg
}

func New(bin string) *Renderer {
	if bin == "" {
		bin = "ffmpeg"
	}
	return &Renderer{Bin: bin}
}

// RenderInput 是渲染输入. 后续接 shots 拼接时扩字段.
type RenderInput struct {
	JobID      string
	Resolution string // 720p / 1080p / 2k / 4k
	Format     string // mp4 / mov / webm
	WorkDir    string // 临时目录, worker 调前 mkdir
	Title      string // m1 显示在测试卡片上的文本
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
	return "1280x720" // 720p / 默认
}

// Render 同步跑 ffmpeg, 返 (output, err). 失败返 err 含 stderr 末尾几行.
func (r *Renderer) Render(ctx context.Context, in RenderInput) (*RenderOutput, error) {
	size := resolutionSize(in.Resolution)
	format := in.Format
	if format == "" {
		format = "mp4"
	}
	const durationSec = 5

	videoPath := filepath.Join(in.WorkDir, "output."+format)
	thumbPath := filepath.Join(in.WorkDir, "thumbnail.jpg")
	title := in.Title
	if title == "" {
		title = "manju render"
	}
	// ffmpeg drawtext 的 text 不能有 ':' / '\' 不转义会炸. 简单只允许 ascii + 数字 +
	// 空格 + 短横线, 其他替成下划线.
	safeTitle := sanitizeTitle(title)

	// 1. 主视频. 黑底白字, 居中, 5 秒.
	//    用 -t 限时长, 避免 lavfi 无限流.
	args := []string{
		"-y",
		"-f", "lavfi",
		"-i", fmt.Sprintf("color=c=black:s=%s:r=24:d=%d", size, durationSec),
		"-vf", fmt.Sprintf("drawtext=fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='%s'", safeTitle),
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-preset", "ultrafast",
		"-t", fmt.Sprintf("%d", durationSec),
		videoPath,
	}
	if err := runFFmpeg(ctx, r.Bin, args); err != nil {
		return nil, fmt.Errorf("render mp4: %w", err)
	}

	// 2. thumbnail (第一帧). 从生成的 mp4 抽帧.
	thumbArgs := []string{
		"-y",
		"-i", videoPath,
		"-vframes", "1",
		"-q:v", "3",
		thumbPath,
	}
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
	// 超时由 ctx 控制. worker 调时给宽松 ctx (5 min) 避免长视频卡死.
	cmd := exec.CommandContext(ctx, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		tail := tailLines(string(out), 10)
		return fmt.Errorf("ffmpeg exit: %v; output:\n%s", err, tail)
	}
	return nil
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
