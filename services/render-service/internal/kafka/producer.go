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
	"errors"
	"fmt"
	"net"
	"strconv"
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

// EnqueueRaw 直接写 key+value, 供 worker re-enqueue 用 (payload 已序列化).
func (p *Producer) EnqueueRaw(ctx context.Context, key string, value []byte) error {
	return p.w.WriteMessages(ctx, kgo.Message{
		Key:   []byte(key),
		Value: value,
	})
}

func (p *Producer) Close() error {
	if p.w == nil {
		return nil
	}
	return p.w.Close()
}

// EnsureTopic 显式建 topic. 启动时调一次, 不依赖 broker auto-create-topic
// 元数据传播 (实测首发 POST 常撞 "Unknown Topic Or Partition" 几秒).
//
// 失败处理:
//   - 已存在 (TopicAlreadyExists): 返 nil
//   - 连接失败 / kafka 暂不可用: 返 err, 调用方 warn 不阻塞启动
//   - 其他: 返 err
//
// 与 architecture.md §5: render.requested 16 partition.
func EnsureTopic(ctx context.Context, brokers []string, topic string, partitions int, replicationFactor int) error {
	if len(brokers) == 0 {
		return errors.New("no brokers")
	}
	// 1. 连任一 broker
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := kgo.DialContext(ctx, "tcp", brokers[0])
	if err != nil {
		return fmt.Errorf("dial kafka: %w", err)
	}
	defer conn.Close()

	// 2. 找 controller (建 topic 必须连 controller)
	controller, err := conn.Controller()
	if err != nil {
		return fmt.Errorf("get controller: %w", err)
	}
	cAddr := net.JoinHostPort(controller.Host, strconv.Itoa(controller.Port))
	cConn, err := dialer.DialContext(ctx, "tcp", cAddr)
	if err != nil {
		return fmt.Errorf("dial controller %s: %w", cAddr, err)
	}
	cKafka := kgo.NewConn(cConn, "", 0)
	defer cKafka.Close()

	// 3. CreateTopics 幂等: 已存在的 topic 也会回 success (kgo.CreateTopics 不区分),
	// 但 broker 层会返 TOPIC_ALREADY_EXISTS. kgo 把这个当 error.Is(err, TopicAlready)
	// 处理 — 没暴露 sentinel, 用 字符串包含兜底.
	err = cKafka.CreateTopics(kgo.TopicConfig{
		Topic:             topic,
		NumPartitions:     partitions,
		ReplicationFactor: replicationFactor,
	})
	if err != nil {
		if isTopicAlreadyExists(err) {
			return nil
		}
		return fmt.Errorf("create topic %s: %w", topic, err)
	}
	return nil
}

func isTopicAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	// kgo 没暴露 typed error, 用字符串匹配 (kafka 协议常量 36 = TOPIC_ALREADY_EXISTS)
	return contains(s, "Topic with this name already exists") ||
		contains(s, "TOPIC_ALREADY_EXISTS") ||
		contains(s, "already exists")
}

func contains(s, sub string) bool {
	return len(sub) <= len(s) && (s == sub || (len(s) >= len(sub) && indexOf(s, sub) >= 0))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
