// asset-service 全部端点.
// Route 是薄壳, 业务逻辑在 src/services/.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { forbidden, invalidInput } from '../apperr.js';
import type { Asset } from '../db/schema.js';
import { mustAuth } from '../plugins/auth.js';
import * as assetSvc from '../services/assets.js';
import * as uploadSvc from '../services/upload.js';

const uuidSchema = z.string().uuid();

const writeRoles = new Set(['owner', 'admin', 'editor']);

function requireWrite(role: string) {
  if (!writeRoles.has(role)) throw forbidden('viewer 只读, 无写权限');
}

const assetTypeSchema = z.enum(['character', 'scene', 'prop', 'music', 'sfx', 'voice']);

const listQuerySchema = z.object({
  type: assetTypeSchema.optional(),
  q: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  cursor: z.string().uuid().optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const createAssetBody = z.object({
  type: assetTypeSchema,
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  file_url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  bg_style: z.string().max(50).optional().nullable(),
  avatar: z.string().max(10).optional().nullable(),
  duration_ms: z.coerce.number().int().min(0).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const patchAssetBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  file_url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  bg_style: z.string().max(50).optional().nullable(),
  avatar: z.string().max(10).optional().nullable(),
  duration_ms: z.coerce.number().int().min(0).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const signUploadBody = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.string().min(1),
  size_bytes: z.coerce.number().int().min(1).max(500_000_000), // 500MB max
  purpose: z.string().min(1),
  asset_type: assetTypeSchema.optional(),
});

export async function registerRoutes(app: FastifyInstance) {
  // 全部受保护
  app.addHook('preHandler', app.requireAuth);

  // ---- assets CRUD ----

  app.get('/v1/assets', async (req, reply) => {
    const auth = mustAuth(req);
    const query = parseOrThrow(listQuerySchema, req.query);
    const tags = query.tags ? query.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
    const result = await assetSvc.listAssets(auth, {
      type: query.type,
      q: query.q,
      tags,
      cursor: query.cursor,
      pageSize: query.page_size,
    });
    app.writeJsonList(reply, req, 200, result.items.map(toAssetDTO), {
      page_size: query.page_size,
      has_more: result.hasMore,
      next_cursor: result.nextCursor,
    });
  });

  app.post('/v1/assets', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const body = parseOrThrow(createAssetBody, req.body);
    const asset = await assetSvc.createAsset(auth, {
      type: body.type,
      name: body.name,
      description: body.description,
      tags: body.tags,
      fileUrl: body.file_url,
      thumbnailUrl: body.thumbnail_url,
      bgStyle: body.bg_style,
      avatar: body.avatar,
      durationMs: body.duration_ms,
      metadata: body.metadata,
    });
    app.writeJson(reply, req, 201, toAssetDTO(asset));
  });

  app.get('/v1/assets/:id', async (req, reply) => {
    const auth = mustAuth(req);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const asset = await assetSvc.getAsset(auth, id);
    app.writeJson(reply, req, 200, toAssetDTO(asset));
  });

  app.patch('/v1/assets/:id', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const body = parseOrThrow(patchAssetBody, req.body);
    const asset = await assetSvc.updateAsset(auth, id, {
      name: body.name,
      description: body.description,
      tags: body.tags,
      fileUrl: body.file_url,
      thumbnailUrl: body.thumbnail_url,
      bgStyle: body.bg_style,
      avatar: body.avatar,
      durationMs: body.duration_ms,
      metadata: body.metadata,
    });
    app.writeJson(reply, req, 200, toAssetDTO(asset));
  });

  app.delete('/v1/assets/:id', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    await assetSvc.deleteAsset(auth, id);
    reply.code(204).send();
  });

  // ---- upload ----

  app.post('/v1/upload/sign', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const body = parseOrThrow(signUploadBody, req.body);
    const result = await uploadSvc.generatePresignedUrl({
      filename: body.filename,
      contentType: body.content_type,
      sizeBytes: body.size_bytes,
      purpose: body.purpose,
      teamId: auth.teamId,
      assetType: body.asset_type,
    });
    app.writeJson(reply, req, 200, result);
  });
}

// ---- DTO ----

function toAssetDTO(a: Asset) {
  return {
    id: a.id,
    team_id: a.teamId,
    type: a.type,
    name: a.name,
    description: a.description,
    tags: a.tags,
    file_url: a.fileUrl,
    thumbnail_url: a.thumbnailUrl,
    bg_style: a.bgStyle,
    avatar: a.avatar,
    duration_ms: a.durationMs,
    uses_count: a.usesCount,
    created_by: a.createdBy,
    metadata: a.metadata,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

// ---- helper ----

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw invalidInput('参数校验失败', { issues: r.error.issues });
  }
  return r.data;
}
