// Business logic for scripts (1:1 with projects).
// 所有 DB 访问都通过 withTeamContext, 让 RLS 兜底.

import { eq, sql } from 'drizzle-orm';

import { conflict, notFound } from '../apperr.js';
import { withTeamContext } from '../db/client.js';
import { scripts, type Script } from '../db/schema.js';

export interface AuthCtx {
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
}

// ---- get or create ----

export async function getScript(ctx: AuthCtx, projectId: string): Promise<Script> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const rows = await tx
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .limit(1);
    if (rows.length > 0) return rows[0]!;
    // 自动创建空 script
    const inserted = await tx
      .insert(scripts)
      .values({ projectId, content: '', updatedBy: ctx.userId })
      .returning();
    return inserted[0]!;
  });
}

// ---- update with optimistic lock ----

export interface UpdateScriptInput {
  content: string;
  expectedVersionNo: number;
}

export async function updateScript(ctx: AuthCtx, projectId: string, input: UpdateScriptInput): Promise<Script> {
  return withTeamContext(ctx.teamId, ctx.userId, async (tx) => {
    const rows = await tx
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .limit(1);

    if (rows.length === 0) throw notFound('脚本不存在');
    const current = rows[0]!;

    if (current.versionNo !== input.expectedVersionNo) {
      throw conflict('版本冲突, 请刷新后重试', {
        current_version_no: current.versionNo,
        expected_version_no: input.expectedVersionNo,
      });
    }

    const wordCount = countWords(input.content);
    const sceneCount = countScenes(input.content);

    const updated = await tx
      .update(scripts)
      .set({
        content: input.content,
        wordCount,
        sceneCount,
        updatedBy: ctx.userId,
        versionNo: sql`${scripts.versionNo} + 1`,
      })
      .where(eq(scripts.projectId, projectId))
      .returning();

    return updated[0]!;
  });
}

// ---- helpers ----

function countWords(content: string): number {
  if (!content) return 0;
  // 中文字符数 + 英文单词数
  const chineseChars = content.match(/[一-鿿]/g);
  const withoutChinese = content.replace(/[一-鿿]/g, ' ');
  const englishWords = withoutChinese.trim().split(/\s+/).filter(Boolean);
  return (chineseChars?.length ?? 0) + englishWords.length;
}

function countScenes(content: string): number {
  if (!content) return 0;
  const lines = content.split('\n');
  return lines.filter((l) => l.startsWith('## ')).length;
}
