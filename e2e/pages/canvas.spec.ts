import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS_URL = 'http://127.0.0.1:4173/canvas';
const authState = JSON.parse(
  readFileSync(resolve(process.cwd(), 'e2e/.auth/user.json'), 'utf8'),
) as {
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

const authStorage = new Map(
  (authState.origins ?? [])
    .flatMap((origin) => origin.localStorage ?? [])
    .map((entry) => [entry.name, entry.value]),
);

const projectId = 'proj_canvas_demo';

const project = {
  id: projectId,
  team_id: 'team_demo',
  owner_id: 'user_demo',
  name: '雨夜便利店',
  genre: '都市奇幻',
  status: 'draft',
  progress: 68,
  version: 'v12',
  thumbnail_url: null,
  bg_style: '电影感',
  metadata: {},
  deleted_at: null,
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} as const;

const script = {
  project_id: projectId,
  content: [
    '# 开场异响',
    '暴雨夜，便利店后门传来金属碰撞声，店员阿青停下手里的扫码枪。',
    '',
    '## 镜中来客',
    '一名浑身湿透的陌生人推门进来，阿青在监控里却看见他仍站在门外。 ',
  ].join('\n'),
  format: 'markdown',
  word_count: 126,
  scene_count: 2,
  version_no: 12,
  updated_by: 'user_demo',
  updated_at: '2026-06-04T09:00:00.000Z',
} as const;

const shots = [
  {
    id: 'shot_1',
    project_id: projectId,
    order_index: 0,
    num: '01',
    title: '便利店门口的暴雨',
    shot_type: 'wide',
    duration_ms: 3500,
    dialog: '外面的雨像有人在敲门。',
    image_url: 'https://example.com/shot-1.png',
    bg_style: '电影感',
    voice_id: null,
    metadata: { style: '电影感' },
    created_at: '2026-06-04T07:10:00.000Z',
    updated_at: '2026-06-04T07:15:00.000Z',
  },
  {
    id: 'shot_2',
    project_id: projectId,
    order_index: 1,
    num: '02',
    title: '监控画面异常',
    shot_type: 'medium',
    duration_ms: 2800,
    dialog: '阿青盯着监控，发现门口出现了第二个人影。',
    image_url: 'https://example.com/shot-2.png',
    bg_style: '电影感',
    voice_id: null,
    metadata: { style: '电影感' },
    created_at: '2026-06-04T07:20:00.000Z',
    updated_at: '2026-06-04T07:25:00.000Z',
  },
] as const;

const characters = [
  {
    id: 'char_1',
    team_id: 'team_demo',
    type: 'character',
    name: '阿青',
    description: '二十四岁，便利店夜班店员，外冷内热，习惯先观察再行动。',
    tags: ['主角', '夜班'],
    file_url: null,
    thumbnail_url: 'https://example.com/char-aqing.png',
    bg_style: null,
    avatar: null,
    duration_ms: null,
    uses_count: 3,
    created_by: 'user_demo',
    metadata: {},
    created_at: '2026-06-04T06:00:00.000Z',
    updated_at: '2026-06-04T06:00:00.000Z',
  },
] as const;

function envelope<T>(data: T, meta?: Record<string, unknown>) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data,
      meta: meta ?? {
        page_size: Array.isArray(data) ? data.length : 1,
        has_more: false,
        next_cursor: null,
      },
    }),
  };
}

test.describe('Canvas', () => {
  test('keeps canvas context in sync with chat focus and coordination objects', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = [];

    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('manju.auth.access', access);
        window.localStorage.setItem('manju.auth.refresh', refresh);
      },
      {
        access: authStorage.get('manju.auth.access') ?? 'playwright-access',
        refresh: authStorage.get('manju.auth.refresh') ?? 'playwright-refresh',
      },
    );

    await page.route('**/v1/projects**', async (route) => {
      await route.fulfill(envelope([project]));
    });
    await page.route(`**/v1/projects/${projectId}/script`, async (route) => {
      await route.fulfill(envelope(script));
    });
    await page.route(`**/v1/projects/${projectId}/shots`, async (route) => {
      await route.fulfill(envelope(shots));
    });
    await page.route('**/v1/assets/characters**', async (route) => {
      await route.fulfill(envelope(characters));
    });
    await page.route('**/v1/ai/chat', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      chatRequests.push(payload);
      const context = (payload.context ?? {}) as Record<string, unknown>;
      const focusMemory = (context.focus_memory ?? {}) as {
        object?: { label?: string };
      };
      const focusLabel = focusMemory.object?.label ?? '当前对象';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thinking: `正在围绕 ${focusLabel} 组织当前判断`,
          reply: `我已经带着画布上下文在看 ${focusLabel}，接下来会围绕这个对象继续判断，不会只顺着聊天历史续写。`,
          options: [],
          extracted: {},
          trigger: null,
        }),
      });
    });

    await page.goto(CANVAS_URL);

    await expect(page.getByText('雨夜便利店', { exact: true })).toBeVisible();
    await expect(page.getByTestId('canvas-title-strip')).toBeVisible();
    await expect(page.getByTestId('canvas-tools-chrome')).toBeVisible();
    await expect(page.getByTestId('canvas-assistant-entry')).toBeVisible();
    await expect(page.getByRole('button', { name: '主创协作' })).toBeVisible();
    await expect(page.getByRole('button', { name: '画布工具' })).toBeVisible();
    await page.getByRole('button', { name: '画布工具' }).click();
    await expect(page.getByRole('menuitem', { name: '对象详情' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '主创协作' }).click();
    await expect(page.getByTestId('canvas-assistant-surface')).toBeVisible();
    await expect(page.getByTestId('canvas-title-strip')).toBeHidden();
    await expect(page.getByTestId('canvas-tools-chrome')).toBeHidden();
    await expect(page.getByTestId('canvas-assistant-entry')).toBeHidden();
    await expect(page.getByPlaceholder('继续聊项目方向、镜头或当前卡点…')).toBeVisible();
    await expect(page.getByText('测试项目')).toBeVisible();
    await expect(page.getByText('主创搭档')).toHaveCount(0);
    await expect(page.getByText(/当前协作:/)).toHaveCount(0);
    await expect(page.getByText('找方向')).toHaveCount(0);
    await page.getByRole('button', { name: '收起主创协作' }).click();
    await expect(page.getByTestId('canvas-assistant-surface')).toHaveCount(0);
    await expect(page.getByTestId('canvas-title-strip')).toBeVisible();
    await expect(page.getByTestId('canvas-tools-chrome')).toBeVisible();
    await expect(page.getByTestId('canvas-assistant-entry')).toBeVisible();

    await page.getByTestId('canvas').getByText('Script 01 · 开场异响').click({ force: true });
    const scriptNodeBox = await page.getByTestId('canvas').getByText('Script 01 · 开场异响').boundingBox();
    const workbenchBox = await page.getByTestId('canvas-object-studio-surface').boundingBox();
    await expect(page.getByPlaceholder('围绕 Script 01 · 开场异响 继续判断、改写或推进…')).toBeVisible();
    await expect(page.getByTestId('canvas-title-strip')).toBeHidden();
    await expect(page.getByTestId('canvas-tools-chrome')).toBeHidden();
    await expect(page.getByTestId('canvas-assistant-entry')).toBeHidden();
    await expect(page.getByTestId('canvas-object-studio-editor')).toBeVisible();
    await expect(page.getByTestId('canvas-object-studio-chat')).toBeVisible();
    await expect(page.getByText('导演协作')).toBeVisible();
    await expect(page.getByText('剧本 · 场 1')).toBeVisible();
    expect(scriptNodeBox).not.toBeNull();
    expect(workbenchBox).not.toBeNull();
    if (scriptNodeBox && workbenchBox) {
      expect(Math.abs(workbenchBox.y - scriptNodeBox.y)).toBeLessThan(420);
    }
    await expect(page.getByText('剧本对象 · Script 01 · 开场异响')).toBeVisible();
    await expect(page.getByText('判断这一场剧本是否要继续展开、改写，还是直接进入分镜。')).toBeVisible();
    await expect(page.getByText('做分镜')).toHaveCount(0);
    await expect(page.getByText(/当前焦点:/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '详情', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '原地编辑' })).toHaveCount(0);
    await expect(page.getByTestId('canvas-assistant-surface')).toHaveCount(0);

    await expect
      .poll(() => chatRequests.length, { message: 'expected a chat turn after requesting AI discussion for a script node' })
      .toBeGreaterThan(0);

    const scriptTurn = chatRequests.at(-1) as {
      context?: {
        focus_memory?: { object?: { id?: string; kind?: string; label?: string } };
        canvas_context_summary?: {
          focus?: { ids?: string[] };
          stage_summary?: { shot_count?: number; character_count?: number };
          pending_decisions?: Array<{ id?: string }>;
        };
      };
    };

    expect(scriptTurn.context?.focus_memory?.object?.id).toBe('script-0');
    expect(scriptTurn.context?.focus_memory?.object?.kind).toBe('script_scene');
    expect(scriptTurn.context?.canvas_context_summary?.focus?.ids).toEqual(['script-0']);
    expect(scriptTurn.context?.canvas_context_summary?.stage_summary?.shot_count).toBe(2);
    expect(scriptTurn.context?.canvas_context_summary?.stage_summary?.character_count).toBe(1);
    expect(
      scriptTurn.context?.canvas_context_summary?.pending_decisions?.some((item) => item.id === 'decision-refresh-storyboard'),
    ).toBe(true);
  });
});
