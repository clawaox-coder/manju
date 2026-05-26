import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import { type Config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin, writeJsonPlugin } from './plugins/error-handler.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { registerRoutes } from './routes/index.js';

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      ...(cfg.ENV === 'local'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: cfg.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-Device-Id'],
    credentials: false,
    maxAge: 300,
  });

  await app.register(requestIdPlugin);
  await app.register(writeJsonPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin, {
    publicKeyPath: cfg.JWT_PUBLIC_KEY_PATH,
    issuer: cfg.JWT_ISSUER,
  });

  app.get('/healthz', { logLevel: 'warn' }, async (_req, reply) => {
    reply.type('text/plain').send('ok');
  });

  await app.register(registerRoutes);

  return app;
}
