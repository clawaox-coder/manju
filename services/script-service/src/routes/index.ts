// script-service 全部端点.
// Route 是薄壳, 业务逻辑在 src/services/.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { forbidden, invalidInput } from '../apperr.js';
import type { Script } from '../db/schema.js';
import type { Shot } from '../db/schema.js';
import { mustAuth } from '../plugins/auth.js';
import * as scriptSvc from '../services/scripts.js';
import * as shotSvc from '../services/shots.js';

const uuidSchema = z.string().uuid();

const writeRoles = new Set(['owner', 'admin', 'editor']);

function requireWrite(role: string) {
  if (!writeRoles.has(role)) throw forbidden('viewer 只读, 无写权限');
}

const updateScriptBody = z.object({
  content: z.string(),
  expected_version_no: z.coerce.number().int().min(1),
});

const createShotBody = z.object({
  title: z.string().max(200).optional().nullable(),
  shot_type: z.string().max(50).optional().nullable(),
  duration_ms: z.coerce.number().int().min(0).optional(),
  dialog: z.string().optional().nullable(),
  after_shot_id: z.string().uuid().optional().nullable(),
});

const patchShotBody = z.object({
  title: z.string().max(200).optional().nullable(),
  shot_type: z.string().max(50).optional().nullable(),
  duration_ms: z.coerce.number().int().min(0).optional(),
  dialog: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  bg_style: z.string().max(50).optional().nullable(),
  num: z.string().max(10).optional().nullable(),
});

const reorderBody = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export async function registerRoutes(app: FastifyInstance) {
  // 全部受保护
  app.addHook('preHandler', app.requireAuth);

  // ---- script ----

  app.get('/v1/projects/:id/script', async (req, reply) => {
    const auth = mustAuth(req);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const script = await scriptSvc.getScript(auth, id);
    app.writeJson(reply, req, 200, toScriptDTO(script));
  });

  app.put('/v1/projects/:id/script', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const body = parseOrThrow(updateScriptBody, req.body);
    const script = await scriptSvc.updateScript(auth, id, {
      content: body.content,
      expectedVersionNo: body.expected_version_no,
    });
    app.writeJson(reply, req, 200, toScriptDTO(script));
  });

  // ---- shots ----

  app.get('/v1/projects/:id/shots', async (req, reply) => {
    const auth = mustAuth(req);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const list = await shotSvc.listShots(auth, id);
    app.writeJsonList(reply, req, 200, list.map(toShotDTO), {
      page_size: list.length,
      has_more: false,
    });
  });

  app.post('/v1/projects/:id/shots', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const body = parseOrThrow(createShotBody, req.body);
    const shot = await shotSvc.createShot(auth, id, {
      title: body.title,
      shotType: body.shot_type,
      durationMs: body.duration_ms,
      dialog: body.dialog,
      afterShotId: body.after_shot_id,
    });
    app.writeJson(reply, req, 201, toShotDTO(shot));
  });

  app.patch('/v1/projects/:id/shots/:shotId', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string; shotId: string }).id);
    const shotId = parseOrThrow(uuidSchema, (req.params as { id: string; shotId: string }).shotId);
    const body = parseOrThrow(patchShotBody, req.body);
    const shot = await shotSvc.updateShot(auth, id, shotId, {
      title: body.title,
      shotType: body.shot_type,
      durationMs: body.duration_ms,
      dialog: body.dialog,
      imageUrl: body.image_url,
      bgStyle: body.bg_style,
      num: body.num,
    });
    app.writeJson(reply, req, 200, toShotDTO(shot));
  });

  app.delete('/v1/projects/:id/shots/:shotId', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string; shotId: string }).id);
    const shotId = parseOrThrow(uuidSchema, (req.params as { id: string; shotId: string }).shotId);
    await shotSvc.deleteShot(auth, id, shotId);
    reply.code(204).send();
  });

  app.put('/v1/projects/:id/shots/reorder', async (req, reply) => {
    const auth = mustAuth(req);
    requireWrite(auth.role);
    const id = parseOrThrow(uuidSchema, (req.params as { id: string }).id);
    const body = parseOrThrow(reorderBody, req.body);
    const list = await shotSvc.reorderShots(auth, id, body.order);
    app.writeJsonList(reply, req, 200, list.map(toShotDTO), {
      page_size: list.length,
      has_more: false,
    });
  });
}

// ---- DTOs ----

function toScriptDTO(s: Script) {
  return {
    project_id: s.projectId,
    content: s.content,
    format: s.format,
    word_count: s.wordCount,
    scene_count: s.sceneCount,
    version_no: s.versionNo,
    updated_by: s.updatedBy,
    updated_at: s.updatedAt.toISOString(),
  };
}

function toShotDTO(s: Shot) {
  return {
    id: s.id,
    project_id: s.projectId,
    order_index: s.orderIndex,
    num: s.num,
    title: s.title,
    shot_type: s.shotType,
    duration_ms: s.durationMs,
    dialog: s.dialog,
    image_url: s.imageUrl,
    bg_style: s.bgStyle,
    voice_id: s.voiceId,
    metadata: s.metadata,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
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
