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
	AccessKey string
	SecretKey string
	Bucket    string
	Region    string
}

type Client struct {
	cfg     Config
	api     *s3.Client
	presign *s3.PresignClient
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
	presign := s3.NewPresignClient(api)

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
	fileURL := c.cfg.Endpoint + "/" + c.cfg.Bucket + "/" + key

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
