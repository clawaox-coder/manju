// Package redisx 封装 refresh-cache + 计数限流.

package redisx

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func New(url string) (*Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	return &Client{rdb: redis.NewClient(opt)}, nil
}

func (c *Client) Close() error { return c.rdb.Close() }

// Ping 用于健康检查.
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

// ---- refresh token cache ----
// Key: refresh:<sha256(token)>  Value: user_id (uuid string)
// 写入时 TTL = refresh token 剩余有效期.

func (c *Client) CacheRefresh(ctx context.Context, hash, userID string, ttl time.Duration) error {
	return c.rdb.Set(ctx, "refresh:"+hash, userID, ttl).Err()
}

// LookupRefresh 返回 user_id; 不存在返回 ErrCacheMiss.
func (c *Client) LookupRefresh(ctx context.Context, hash string) (string, error) {
	v, err := c.rdb.Get(ctx, "refresh:"+hash).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrCacheMiss
	}
	return v, err
}

func (c *Client) DropRefresh(ctx context.Context, hash string) error {
	return c.rdb.Del(ctx, "refresh:"+hash).Err()
}

// PinRefreshGrace 把 refresh 缓存 TTL 改为 grace 秒 (rotation race-condition).
func (c *Client) PinRefreshGrace(ctx context.Context, hash string, grace time.Duration) error {
	return c.rdb.Expire(ctx, "refresh:"+hash, grace).Err()
}

// ---- rate limit ----
// 实现: INCR + EXPIRE(NX), 同 key 复用首次 TTL.

// Incr 返回当前窗口内计数. 第一次 INCR 后设置 TTL.
func (c *Client) Incr(ctx context.Context, key string, window time.Duration) (int64, error) {
	pipe := c.rdb.Pipeline()
	cnt := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return cnt.Val(), nil
}

// GetInt 读取整数计数; 不存在返回 0.
func (c *Client) GetInt(ctx context.Context, key string) (int64, error) {
	v, err := c.rdb.Get(ctx, key).Int64()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return v, err
}

// Del 删除任意 key.
func (c *Client) Del(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return c.rdb.Del(ctx, keys...).Err()
}

// FlushAll 清掉所有 key — 仅用于测试 helper.
func (c *Client) FlushAll(ctx context.Context) error {
	return c.rdb.FlushAll(ctx).Err()
}

// ---- password reset ----

// SetResetToken 存储 reset:{token} → userID, TTL 15 分钟.
func (c *Client) SetResetToken(ctx context.Context, token, userID string, ttl time.Duration) error {
	return c.rdb.Set(ctx, "reset:"+token, userID, ttl).Err()
}

// LookupResetToken 返回 userID; 不存在返回 ErrCacheMiss.
func (c *Client) LookupResetToken(ctx context.Context, token string) (string, error) {
	v, err := c.rdb.Get(ctx, "reset:"+token).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrCacheMiss
	}
	return v, err
}

// DropResetToken 删除 reset token.
func (c *Client) DropResetToken(ctx context.Context, token string) error {
	return c.rdb.Del(ctx, "reset:"+token).Err()
}

var ErrCacheMiss = errors.New("cache miss")
