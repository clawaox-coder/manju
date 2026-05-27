// Package s3util 封装 aws-sdk-go-v2 的 S3 presign 客户端, 兼容 MinIO (force path style).
//
// 设计要点:
//   - PutObject 预签 URL, 默认 5 分钟过期
//   - object key = assets/<team_id>/<type>/<uuid><ext>
//   - file_url 是上传完成后访问的永久 URL, 与 endpoint+bucket 拼接
//   - EnsureBucket 在服务启动时调一次, 把 bucket 不存在的常见 dev 坑兜底掉

package s3util

import (
	"context"
	"errors"
	"os"
	"path"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
)

const defaultExpires = 5 * time.Minute

type Config struct {
	Endpoint  string // http://minio:9000 / https://s3.cn-north-1.amazonaws.com.cn
	// PresignEndpoint 留空时回退用 Endpoint. 用于 dev: worker 在 docker network
	// 内 PUT 走 internal Endpoint (http://minio:9000), 但生成的 presign GET URL
	// 需要 host 浏览器可达, 用 PresignEndpoint (http://localhost:9000).
	// prod: 通常 internal/external 是同一个 https endpoint, 留空即可.
	PresignEndpoint string
	AccessKey       string
	SecretKey       string
	Bucket          string
	Region          string
}

type Client struct {
	cfg     Config
	api     *s3.Client // internal endpoint, 跑 PutObject/HeadBucket 等
	presign *s3.PresignClient // presign endpoint, 生成给前端的 URL
}

func New(ctx context.Context, c Config) (*Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(c.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			c.AccessKey, c.SecretKey, "")),
	)
	if err != nil {
		return nil, err
	}

	api := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(c.Endpoint)
		o.UsePathStyle = true // MinIO 必需
	})

	// presign client: 同凭据但 BaseEndpoint 是 PresignEndpoint
	presignBase := c.PresignEndpoint
	if presignBase == "" {
		presignBase = c.Endpoint
	}
	presignAPI := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(presignBase)
		o.UsePathStyle = true
	})
	presign := s3.NewPresignClient(presignAPI)

	return &Client{cfg: c, api: api, presign: presign}, nil
}

// HeadObject 仅供测试与运维诊断使用 — 检查 key 是否存在.
func (c *Client) HeadObject(ctx context.Context, key string) error {
	_, err := c.api.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(c.cfg.Bucket),
		Key:    aws.String(key),
	})
	return err
}

// EnsureBucket dev/test 友好: bucket 不存在就创建.
// prod 部署应由 IaC 提前建 bucket, 本调用幂等, 已存在返回 nil.
func (c *Client) EnsureBucket(ctx context.Context) error {
	_, err := c.api.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(c.cfg.Bucket)})
	if err == nil {
		return nil
	}
	// HeadBucket 在 minio 上对 404 返回 NotFound, 直接尝试 create.
	_, err = c.api.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(c.cfg.Bucket)})
	if err == nil {
		return nil
	}
	// bucket 已存在 (BucketAlreadyOwnedByYou / BucketAlreadyExists) 视为成功
	var owned *types.BucketAlreadyOwnedByYou
	var exists *types.BucketAlreadyExists
	if errors.As(err, &owned) || errors.As(err, &exists) {
		return nil
	}
	return err
}

type SignInput struct {
	Filename    string
	ContentType string
	SizeBytes   int64
	TeamID      uuid.UUID
	AssetType   string // optional, 落 key 里; 空 → "misc"
}

type SignResult struct {
	UploadURL string            `json:"upload_url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	FileURL   string            `json:"file_url"`
	ExpiresIn int               `json:"expires_in"`
	Key       string            `json:"key"`
}

func (c *Client) PresignPut(ctx context.Context, in SignInput) (*SignResult, error) {
	ext := path.Ext(in.Filename)
	assetType := in.AssetType
	if assetType == "" {
		assetType = "misc"
	}
	key := "assets/" + in.TeamID.String() + "/" + assetType + "/" + uuid.NewString() + ext

	req, err := c.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.cfg.Bucket),
		Key:           aws.String(key),
		ContentType:   aws.String(in.ContentType),
		ContentLength: aws.Int64(in.SizeBytes),
	}, s3.WithPresignExpires(defaultExpires))
	if err != nil {
		return nil, err
	}

	// file_url: 上传完成后访问用. MinIO 与 S3 path-style 都形如 <endpoint>/<bucket>/<key>.
	// 走 presign endpoint (前端可达), 不走 internal endpoint.
	fileURL := c.publicHost() + "/" + c.cfg.Bucket + "/" + key

	return &SignResult{
		UploadURL: req.URL,
		Method:    req.Method,
		Headers: map[string]string{
			"Content-Type": in.ContentType,
		},
		FileURL:   fileURL,
		ExpiresIn: int(defaultExpires / time.Second),
		Key:       key,
	}, nil
}

// PutFile 把本地文件上传到 S3, 供 worker 用. 返 (size_bytes, public_url).
// public_url 是 path-style URL, MinIO bucket 私有时不能直接 GET, dev 下用
// PresignGet 拿带签名的 download URL 供前端用.
func (c *Client) PutFile(ctx context.Context, key, localPath, contentType string) (int64, string, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return 0, "", err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return 0, "", err
	}
	_, err = c.api.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.cfg.Bucket),
		Key:           aws.String(key),
		Body:          f,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(st.Size()),
	})
	if err != nil {
		return 0, "", err
	}
	return st.Size(), c.publicHost() + "/" + c.cfg.Bucket + "/" + key, nil
}

// publicHost 返 presign / 公开访问的 base URL. 留空 PresignEndpoint 时回退 Endpoint.
func (c *Client) publicHost() string {
	if c.cfg.PresignEndpoint != "" {
		return c.cfg.PresignEndpoint
	}
	return c.cfg.Endpoint
}

// PresignGet 生成 GET 预签 URL, 供前端下载私有 bucket 内的 mp4 / thumbnail.
func (c *Client) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	req, err := c.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.cfg.Bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}
