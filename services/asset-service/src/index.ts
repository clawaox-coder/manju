// 入口: 装配 config + db + s3 + fastify 服务, 启监听, 等 signal.

import { loadConfig } from './config.js';
import { closeDb, initDb } from './db/client.js';
import { buildServer } from './server.js';
import { ensureBucket, initS3 } from './services/upload.js';

async function main() {
  const cfg = loadConfig();
  initDb(cfg.DATABASE_URL);
  initS3({
    endpoint: cfg.S3_ENDPOINT,
    accessKey: cfg.S3_ACCESS_KEY,
    secretKey: cfg.S3_SECRET_KEY,
    bucket: cfg.S3_BUCKET,
    region: cfg.S3_REGION,
  });

  // ensure bucket exists on startup
  try {
    await ensureBucket();
  } catch (err) {
    // non-fatal: bucket may already exist or MinIO not ready yet
    console.warn('ensureBucket warning:', err);
  }

  const app = await buildServer(cfg);

  const shutdown = async (sig: string) => {
    app.log.info({ sig }, 'shutdown');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: cfg.host, port: cfg.port });
  } catch (err) {
    app.log.error({ err }, 'listen failed');
    process.exit(1);
  }
}

void main();
