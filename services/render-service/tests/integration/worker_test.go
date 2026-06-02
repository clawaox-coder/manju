// Worker 端到端集成测试: testcontainers pg + minio + fake renderer.
// 验证 worker processJob 核心逻辑: status transitions → s3 upload → done.
// 不依赖 ffmpeg binary (用 fake renderer 生成 dummy 文件).
// 不起 kafka container (kafka plumbing 由 docker-compose e2e 覆盖).

package integration

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/manju-org/manju/services/render-service/internal/config"
	"github.com/manju-org/manju/services/render-service/internal/ffmpeg"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/s3util"
	"github.com/manju-org/manju/services/render-service/internal/worker"
)

// fakeRenderer 生成 dummy mp4 + thumbnail 文件, 不调 ffmpeg.
type fakeRenderer struct{}

func (f *fakeRenderer) Render(_ context.Context, in ffmpeg.RenderInput) (*ffmpeg.RenderOutput, error) {
	videoPath := in.WorkDir + "/output.mp4"
	thumbPath := in.WorkDir + "/thumbnail.jpg"
	// 写 dummy 内容
	_ = os.WriteFile(videoPath, []byte("fake-mp4-content-"+in.JobID), 0o644)
	_ = os.WriteFile(thumbPath, []byte("fake-jpg-"+in.JobID), 0o644)
	return &ffmpeg.RenderOutput{
		VideoPath:     videoPath,
		ThumbnailPath: thumbPath,
		DurationMs:    5000,
	}, nil
}

// noopEnqueuer 不 re-enqueue (测试不验重试, 只验 happy path).
type noopEnqueuer struct{}

func (n *noopEnqueuer) Enqueue(_ context.Context, _ string, _ []byte) error { return nil }

func TestWorkerE2E(t *testing.T) {
	if testing.Short() {
		t.Skip("skip worker e2e in short mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// ---- pg ----
	pgC, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("manju_test"),
		tcpostgres.WithUsername("manju"),
		tcpostgres.WithPassword("manju"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second)),
	)
	require.NoError(t, err)

	pgDSN, err := pgC.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	adminPool, err := pgxpool.New(ctx, pgDSN)
	require.NoError(t, err)
	require.NoError(t, applyMigrations(ctx, adminPool))

	for _, stmt := range []string{
		`CREATE ROLE manju_app WITH LOGIN PASSWORD 'app'`,
		`GRANT USAGE ON SCHEMA public TO manju_app`,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manju_app`,
		`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO manju_app`,
	} {
		_, err := adminPool.Exec(ctx, stmt)
		require.NoError(t, err)
	}
	appDSN := strings.Replace(pgDSN, "manju:manju@", "manju_app:app@", 1)
	appPool, err := pgxpool.New(ctx, appDSN)
	require.NoError(t, err)

	// ---- minio ----
	minioC, err := tcminio.Run(ctx, "minio/minio:RELEASE.2025-01-20T14-49-07Z",
		testcontainers.WithEnv(map[string]string{
			"MINIO_ROOT_USER":     "manjuadmin",
			"MINIO_ROOT_PASSWORD": "manjuadmin",
		}),
	)
	require.NoError(t, err)
	minioEndpoint, err := minioC.ConnectionString(ctx)
	require.NoError(t, err)
	if !strings.HasPrefix(minioEndpoint, "http") {
		minioEndpoint = "http://" + minioEndpoint
	}
	s3c, err := s3util.New(ctx, s3util.Config{
		Endpoint:  minioEndpoint,
		AccessKey: minioC.Username,
		SecretKey: minioC.Password,
		Bucket:    "manju-renders-test",
		Region:    "us-east-1",
	})
	require.NoError(t, err)
	require.NoError(t, s3c.EnsureBucket(ctx))

	// ---- seed data ----
	teamID := uuid.New()
	ownerID := uuid.New()
	projectID := uuid.New()
	_, err = adminPool.Exec(ctx, `INSERT INTO teams (id, name) VALUES ($1, $2)`, teamID, "Worker Test")
	require.NoError(t, err)
	_, err = adminPool.Exec(ctx, `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`,
		ownerID, "worker-test@example.com", "Worker Tester")
	require.NoError(t, err)
	_, err = adminPool.Exec(ctx, `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
		teamID, ownerID)
	require.NoError(t, err)
	_, err = adminPool.Exec(ctx, `INSERT INTO projects (id, team_id, owner_id, name) VALUES ($1, $2, $3, $4)`,
		projectID, teamID, ownerID, "Worker Test Project")
	require.NoError(t, err)

	// ---- insert a render job directly ----
	repoJ := repo.New(appPool)
	job, _, err := repoJ.Create(ctx, teamID, ownerID, repo.CreateInput{
		ProjectID:  projectID,
		Priority:   50,
		Resolution: strPtr("720p"),
		Format:     strPtr("mp4"),
	})
	require.NoError(t, err)
	require.Equal(t, "queued", string(job.Status))

	// ---- run worker processJob directly (skip kafka) ----
	cfg := config.Config{
		WorkerID: "test-w-1",
		WorkDir:  t.TempDir(),
	}
	log := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	w := worker.New(worker.Deps{
		Log:      log,
		Repo:     repoJ,
		Pool:     appPool,
		S3:       s3c,
		Renderer: &fakeRenderer{},
		Cfg:      cfg,
		Enqueuer: &noopEnqueuer{},
	})

	// ProcessJob 是 unexported, 用 exported RunSingle 包装
	err = w.RunSingle(ctx, job.ID.String(), teamID.String(), projectID.String(),
		ownerID.String(), "720p", "mp4", 50)
	require.NoError(t, err)

	// ---- verify final state ----
	finalJob, err := repoJ.Get(ctx, teamID, ownerID, job.ID)
	require.NoError(t, err)
	assert.Equal(t, "done", string(finalJob.Status))
	assert.Equal(t, int16(100), finalJob.Progress)
	assert.NotNil(t, finalJob.ResultURL)
	assert.NotNil(t, finalJob.ThumbnailURL)
	assert.NotNil(t, finalJob.SizeBytes)
	assert.NotNil(t, finalJob.DurationMs)
	assert.Equal(t, int32(5000), *finalJob.DurationMs)
	assert.NotNil(t, finalJob.StartedAt)
	assert.NotNil(t, finalJob.DoneAt)
	assert.Equal(t, "test-w-1", *finalJob.WorkerID)

	// verify s3 object exists
	videoKey := fmt.Sprintf("renders/%s/%s/output.mp4", teamID.String(), job.ID.String())
	err = s3c.HeadObject(ctx, videoKey)
	assert.NoError(t, err, "mp4 should exist in minio")
}

func strPtr(s string) *string { return &s }

var _ worker.Renderer = (*fakeRenderer)(nil)
var _ = http.StatusOK
