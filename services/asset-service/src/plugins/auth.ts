import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { jwtVerify, importSPKI, type KeyLike } from 'jose';
import { readFile } from 'node:fs/promises';

import { forbidden, invalidToken } from '../apperr.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthContext {
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  jti: string;
}

export interface JwtOptions {
  publicKeyPath: string;
  issuer: string;
}

let _publicKey: KeyLike | null = null;

async function loadKey(path: string): Promise<KeyLike> {
  if (_publicKey) return _publicKey;
  const pem = await readFile(path, 'utf8');
  _publicKey = await importSPKI(pem, 'RS256');
  return _publicKey;
}

export const authPlugin = fp<JwtOptions>(async function (app: FastifyInstance, opts) {
  await loadKey(opts.publicKeyPath);

  app.decorate('requireAuth', async function requireAuth(req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw invalidToken('缺少 Authorization Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      const verified = await jwtVerify(token, _publicKey!, {
        issuer: opts.issuer,
        algorithms: ['RS256'],
      });
      payload = verified.payload;
    } catch (err) {
      throw invalidToken((err as Error).message);
    }
    const sub = payload.sub;
    const teamId = payload['team_id'];
    const role = payload['role'];
    const jti = payload.jti;
    if (typeof sub !== 'string' || typeof teamId !== 'string' || typeof role !== 'string' || typeof jti !== 'string') {
      throw invalidToken('token claims 缺失');
    }
    if (!isValidRole(role)) {
      throw forbidden(`未知 role: ${role}`);
    }
    req.auth = { userId: sub, teamId, role, jti };
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
  }
}

function isValidRole(s: string): s is AuthContext['role'] {
  return s === 'owner' || s === 'admin' || s === 'editor' || s === 'viewer';
}

export function mustAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw invalidToken('未鉴权');
  return req.auth;
}
