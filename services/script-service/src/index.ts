// 入口: 装配 config + db + fastify 服务, 启监听, 等 signal.

import { loadConfig } from './config.js';
import { closeDb, initDb } from './db/client.js';
import { buildServer } from './server.js';

async function main() {
  const cfg = loadConfig();
  initDb(cfg.DATABASE_URL);
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
