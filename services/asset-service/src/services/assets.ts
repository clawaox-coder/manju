// Business logic for assets CRUD.
// 所有 DB 访问都通过 withTeamContext, 让 RLS 兜底.

import { and, eq, gt, ilike, isNull, sql } from 'drizzle-orm';

import { notFound } from '../apperr.js';
import { withTeamContext } from '../db/client.js';
import { assets, type Asset } from '../db/schema.js';

export interface AuthCtx {
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
}

export type AssetType = 'character' | 'scene' | 'prop' | 'music' | 'sfx' | 'voice';

// ---- list (cursor-paginated, filterable) ----

export interface ListAssetsInput {
  type?: AssetType;
  q?: string;
  tags?: string[];
  cursor?: string;
  pageSize: number;
}

export interface ListAssetsResult {
  items: Asset[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function listAssets(ctx: AuthCtx, input: ListAssetsInput): Promise<ListAssetsResult> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const conditions = [isNull(assets.deletedAt)];

    if (input.type) {
      conditions.push(eq(assets.type, input.type));
    }
    if (input.q) {
      conditions.push(ilike(assets.name, `%${input.q}%`));
    }
    if (input.tags && input.tags.length > 0) {
      conditions.push(sql`${assets.tags} @> ${input.tags}`);
    }
    if (input.cursor) {
      conditions.push(gt(assets.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(assets.id)
      .limit(input.pageSize + 1);

    const hasMore = rows.length > input.pageSize;
    const items = hasMore ? rows.slice(0, input.pageSize) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, hasMore, nextCursor };
  });
}

// ---- get ----

export async function getAsset(ctx: AuthCtx, id: string): Promise<Asset> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const rows = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
      .limit(1);
    if (rows.length === 0) throw notFound('素材不存在');
    return rows[0]!;
  });
}

// ---- create ----

export interface CreateAssetInput {
  type: AssetType;
  name: string;
  description?: string | null;
  tags?: string[];
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  bgStyle?: string | null;
  avatar?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createAsset(ctx: AuthCtx, input: CreateAssetInput): Promise<Asset> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const rows = await tx
      .insert(assets)
      .values({
        teamId: ctx.teamId,
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        tags: input.tags ?? [],
        fileUrl: input.fileUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        bgStyle: input.bgStyle ?? null,
        avatar: input.avatar ?? null,
        durationMs: input.durationMs ?? null,
        createdBy: ctx.userId,
        metadata: input.metadata ?? {},
      })
      .returning();
    return rows[0]!;
  });
}

// ---- update ----

export interface UpdateAssetInput {
  name?: string;
  description?: string | null;
  tags?: string[];
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  bgStyle?: string | null;
  avatar?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export async function updateAsset(ctx: AuthCtx, id: string, input: UpdateAssetInput): Promise<Asset> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    // verify exists
    const existing = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
      .limit(1);
    if (existing.length === 0) throw notFound('素材不存在');

    const setFields: Record<string, unknown> = {};
    if (input.name !== undefined) setFields.name = input.name;
    if (input.description !== undefined) setFields.description = input.description;
    if (input.tags !== undefined) setFields.tags = input.tags;
    if (input.fileUrl !== undefined) setFields.fileUrl = input.fileUrl;
    if (input.thumbnailUrl !== undefined) setFields.thumbnailUrl = input.thumbnailUrl;
    if (input.bgStyle !== undefined) setFields.bgStyle = input.bgStyle;
    if (input.avatar !== undefined) setFields.avatar = input.avatar;
    if (input.durationMs !== undefined) setFields.durationMs = input.durationMs;
    if (input.metadata !== undefined) setFields.metadata = input.metadata;

    if (Object.keys(setFields).length === 0) return existing[0]!;

    const rows = await tx
      .update(assets)
      .set(setFields)
      .where(eq(assets.id, id))
      .returning();
    return rows[0]!;
  });
}

// ---- soft-delete ----

export async function deleteAsset(ctx: AuthCtx, id: string): Promise<void> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const existing = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
      .limit(1);
    if (existing.length === 0) throw notFound('素材不存在');

    await tx
      .update(assets)
      .set({ deletedAt: sql`now()` })
      .where(eq(assets.id, id));
  });
}
