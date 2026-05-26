import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';

export const requestIdPlugin = fp(async function (app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id'];
    const rid = typeof incoming === 'string' && incoming.length > 0 ? incoming : `req_${randomUUID()}`;
    req.requestId = rid;
    reply.header('x-request-id', rid);
  });
});
