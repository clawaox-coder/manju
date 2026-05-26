// Business logic for shots (ordered list per project).
// 所有 DB 访问都通过 withTeamContext, 让 RLS 兜底.

import { and, eq, gt, sql } from 'drizzle-orm';

import { invalidInput, notFound } from '../apperr.js';
import { withTeamContext } from '../db/client.js';
import { shots, type Shot } from '../db/schema.js';

export interface AuthCtx {
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
}

// ---- list ----

export async function listShots(ctx: AuthCtx, projectId: string): Promise<Shot[]> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    return tx
      .select()
      .from(shots)
      .where(eq(shots.projectId, projectId))
      .orderBy(shots.orderIndex);
  });
}

// ---- create ----

export interface CreateShotInput {
  title?: string | null;
  shotType?: string | null;
  durationMs?: number;
  dialog?: string | null;
  afterShotId?: string | null;
}

export async function createShot(ctx: AuthCtx, projectId: string, input: CreateShotInput): Promise<Shot> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    let orderIndex: number;

    if (input.afterShotId) {
      // 插入在指定 shot 之后
      const ref = await tx
        .select({ orderIndex: shots.orderIndex })
        .from(shots)
        .where(and(eq(shots.id, input.afterShotId), eq(shots.projectId, projectId)))
        .limit(1);
      if (ref.length === 0) throw notFound('after_shot_id 对应的 shot 不存在');
      const afterIdx = ref[0]!.orderIndex;
      // 把 afterIdx 之后的全部 +1
      await tx
        .update(shots)
        .set({ orderIndex: sql`${shots.orderIndex} + 1` })
        .where(and(eq(shots.projectId, projectId), gt(shots.orderIndex, afterIdx)));
      orderIndex = afterIdx + 1;
    } else {
      // 追加到末尾
      const maxRow = await tx
        .select({ maxIdx: sql<number>`coalesce(max(${shots.orderIndex}), -1)` })
        .from(shots)
        .where(eq(shots.projectId, projectId));
      orderIndex = (maxRow[0]?.maxIdx ?? -1) + 1;
    }

    const inserted = await tx
      .insert(shots)
      .values({
        projectId,
        orderIndex,
        title: input.title ?? null,
        shotType: input.shotType ?? null,
        durationMs: input.durationMs ?? 5000,
        dialog: input.dialog ?? null,
      })
      .returning();
    return inserted[0]!;
  });
}

// ---- update ----

export interface UpdateShotInput {
  title?: string | null;
  shotType?: string | null;
  durationMs?: number;
  dialog?: string | null;
  imageUrl?: string | null;
  bgStyle?: string | null;
  num?: string | null;
}

export async function updateShot(ctx: AuthCtx, projectId: string, shotId: string, input: UpdateShotInput): Promise<Shot> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const set: Record<string, unknown> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.shotType !== undefined) set.shotType = input.shotType;
    if (input.durationMs !== undefined) set.durationMs = input.durationMs;
    if (input.dialog !== undefined) set.dialog = input.dialog;
    if (input.imageUrl !== undefined) set.imageUrl = input.imageUrl;
    if (input.bgStyle !== undefined) set.bgStyle = input.bgStyle;
    if (input.num !== undefined) set.num = input.num;

    if (Object.keys(set).length === 0) {
      const rows = await tx.select().from(shots).where(and(eq(shots.id, shotId), eq(shots.projectId, projectId))).limit(1);
      if (rows.length === 0) throw notFound('shot 不存在');
      return rows[0]!;
    }

    const updated = await tx
      .update(shots)
      .set(set)
      .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId)))
      .returning();
    if (updated.length === 0) throw notFound('shot 不存在');
    return updated[0]!;
  });
}

// ---- delete ----

export async function deleteShot(ctx: AuthCtx, projectId: string, shotId: string): Promise<void> {
  await withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const deleted = await tx
      .delete(shots)
      .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId)))
      .returning({ orderIndex: shots.orderIndex });
    if (deleted.length === 0) throw notFound('shot 不存在');

    // 重新索引: 把被删 shot 之后的全部 -1
    const deletedIdx = deleted[0]!.orderIndex;
    await tx
      .update(shots)
      .set({ orderIndex: sql`${shots.orderIndex} - 1` })
      .where(and(eq(shots.projectId, projectId), gt(shots.orderIndex, deletedIdx)));
  });
}

// ---- reorder ----

export async function reorderShots(ctx: AuthCtx, projectId: string, orderedIds: string[]): Promise<Shot[]> {
  if (orderedIds.length === 0) throw invalidInput('order 不能为空');

  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    // 设置 DEFERRABLE 约束延迟检查
    await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]!;
      await tx
        .update(shots)
        .set({ orderIndex: i })
        .where(and(eq(shots.id, id), eq(shots.projectId, projectId)));
    }

    return tx
      .select()
      .from(shots)
      .where(eq(shots.projectId, projectId))
      .orderBy(shots.orderIndex);
  });
}
