import { z } from 'zod';

const schema = z.object({
  ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
  HTTP_ADDR: z.string().default('0.0.0.0:8003'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_ISSUER: z.string().default('manju-auth'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof schema> & {
  host: string;
  port: number;
  corsOrigins: string[];
};

export function loadConfig(): Config {
  const parsed = schema.parse(process.env);
  const [host, port] = parsed.HTTP_ADDR.split(':');
  return {
    ...parsed,
    host: host || '0.0.0.0',
    port: Number(port) || 8003,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
