// Package kafka 包 segmentio/kafka-go writer 成 service.Enqueuer.
//
// 设计:
//   - 一个 *kafka.Writer 跨请求复用 (内部连接池).
//   - WriteMessages 同步阻塞写, 返错时 service 层把错误转为 502 UPSTREAM_FAILED.
//   - key = team_id (同 team 落同 partition, 保证有序).
//   - balancer = Hash (基于 key).
//   - acks = all (RequiredAcks=-1) 保证 broker 全部确认 — m1 安全>吞吐.
//   - kafka 启用 auto-create-topics, 不需要预建. partition 数由 broker 默认 (=16).

package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	kgo "github.com/segmentio/kafka-go"

	"github.com/manju-org/manju/services/render-service/internal/service"
)

// Producer 实现 service.Enqueuer.
type Producer struct {
	w *kgo.Writer
}

func NewProducer(brokers []string, topic string) *Producer {
	return &Producer{
		w: &kgo.Writer{
			Addr:                   kgo.TCP(brokers...),
			Topic:                  topic,
			Balancer:               &kgo.Hash{},
			RequiredAcks:           kgo.RequireAll,
			AllowAutoTopicCreation: true,
			WriteTimeout:           10 * time.Second,
			BatchTimeout:           50 * time.Millisecond,
		},
	}
}

func (p *Producer) Enqueue(ctx context.Context, msg service.EnqueueMessage) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal enqueue message: %w", err)
	}
	return p.w.WriteMessages(ctx, kgo.Message{
		Key:   []byte(msg.TeamID),
		Value: payload,
	})
}

func (p *Producer) Close() error {
	if p.w == nil {
		return nil
	}
	return p.w.Close()
}
