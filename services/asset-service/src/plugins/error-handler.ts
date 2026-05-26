// 统一 JSON 响应 (api.md §3) — 改写 fastify 的 send / errorHandler.

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { AppError, internal } from '../apperr.js';

declare module 'fastify' {
  interface FastifyRequest {
    startNs: bigint;
    requestId: string;
  }
}

export const errorHandlerPlugin = fp(async function (app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    req.startNs = process.hrtime.bigint();
  });

  app.setNotFoundHandler((req, reply) => {
    writeError(reply, req, new AppError({
      code: 'NOT_FOUND',
      status: 404,
      message: `${req.method} ${req.url} 不存在`,
    }));
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      writeError(reply, req, err);
      return;
    }
    // fastify validation error
    const fastifyValidation = (err as FastifyError).validation;
    if (fastifyValidation) {
      writeError(reply, req, new AppError({
        code: 'INVALID_INPUT',
        status: 400,
        message: err.message,
        details: { validation: fastifyValidation },
      }));
      return;
    }
    req.log.error({ err }, 'unhandled error');
    writeError(reply, req, internal('内部错误'));
  });
});

export const writeJsonPlugin = fp(async function (app: FastifyInstance) {
  app.decorate('writeJson', writeJson);
  app.decorate('writeJsonList', writeJsonList);
});

declare module 'fastify' {
  interface FastifyInstance {
    writeJson: typeof writeJson;
    writeJsonList: typeof writeJsonList;
  }
}

function writeJson<T>(reply: FastifyReply, req: FastifyRequest, status: number, data: T) {
  reply
    .code(status)
    .header('content-type', 'application/json; charset=utf-8')
    .send({
      data,
      meta: {
        request_id: req.requestId,
        request_ms: nsToMs(process.hrtime.bigint() - req.startNs),
      },
    });
}

function writeJsonList<T>(reply: FastifyReply, req: FastifyRequest, status: number, data: T[], pageMeta: {
  page_size: number;
  total?: number;
  has_more: boolean;
  next_cursor?: string | null;
}) {
  reply
    .code(status)
    .header('content-type', 'application/json; charset=utf-8')
    .send({
      data,
      meta: {
        request_id: req.requestId,
        request_ms: nsToMs(process.hrtime.bigint() - req.startNs),
        ...pageMeta,
      },
    });
}

function writeError(reply: FastifyReply, req: FastifyRequest, err: AppError) {
  reply
    .code(err.status)
    .header('content-type', 'application/json; charset=utf-8')
    .send({
      error: {
        code: err.code,
        message: err.message,
        request_id: req.requestId,
        ...(err.details ? { details: err.details } : {}),
      },
    });
}

function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}
