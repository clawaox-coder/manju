import type { AssetDTO } from '@/lib/api/assets';
import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';

export const DEMO_CANVAS_PROJECT_ID = '__demo_canvas__';
export const DEMO_CANVAS_PROJECT_NAME = '都市修仙之我有一个万界商城';

export function isDemoCanvasProjectId(projectId: string | undefined | null): projectId is typeof DEMO_CANVAS_PROJECT_ID {
  return projectId === DEMO_CANVAS_PROJECT_ID;
}

export const demoCanvasScript: ScriptDTO = {
  project_id: DEMO_CANVAS_PROJECT_ID,
  format: 'markdown',
  word_count: 148,
  scene_count: 3,
  version_no: 1,
  updated_by: 'local-demo',
  updated_at: '2026-06-05T00:00:00.000Z',
  content: [
    '# 开场 · 屋顶误入',
    '夜雨压城。实习生周临躲雨时误闯天台旧货亭，指尖碰到一枚会发光的铜钱，耳边响起“万界商城已绑定”。',
    '',
    '## 第一笔交易',
    '他用仅剩的愿力换来一张“十秒轻身符”，结果在下班高峰的玻璃幕墙间一跃而过，第一次尝到修仙失控的快感。',
    '',
    '### 代价显形',
    '商城弹出提示：每次赊账都会惊动别界债主。楼下霓虹里，一道不属于这座城市的影子已经抬头看向他。',
  ].join('\n'),
};

export const demoCanvasShots: ShotDTO[] = [
  {
    id: 'demo-shot-01',
    project_id: DEMO_CANVAS_PROJECT_ID,
    order_index: 0,
    num: '01',
    title: 'Shot 01 · 屋顶误入',
    shot_type: '远景',
    duration_ms: 3500,
    dialog: '夜雨压城，周临在废旧天台上误触发光铜钱。',
    image_url: null,
    bg_style: '赛博霓虹',
    voice_id: null,
    metadata: { style: '赛博霓虹' },
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'demo-shot-02',
    project_id: DEMO_CANVAS_PROJECT_ID,
    order_index: 1,
    num: '02',
    title: 'Shot 02 · 第一笔交易',
    shot_type: '中景',
    duration_ms: 2800,
    dialog: '十秒轻身符生效，他从玻璃幕墙间跃下，第一次尝到力量失控的快感。',
    image_url: null,
    bg_style: '电影感',
    voice_id: null,
    metadata: { style: '电影感' },
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'demo-shot-03',
    project_id: DEMO_CANVAS_PROJECT_ID,
    order_index: 2,
    num: '03',
    title: 'Shot 03 · 代价显形',
    shot_type: '特写',
    duration_ms: 3200,
    dialog: '商城提示债主将至，楼下霓虹里有一道不属于这座城市的影子抬头看向他。',
    image_url: null,
    bg_style: '悬疑压迫',
    voice_id: null,
    metadata: { style: '悬疑压迫' },
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  },
];

export const demoCanvasCharacters: AssetDTO[] = [
  {
    id: 'demo-char-zhoulin',
    team_id: null,
    type: 'character',
    name: '周临',
    description: '男主角，都市修仙新手，表面谨慎，第一次掌控力量后逐渐兴奋失衡。',
    tags: ['男主', '都市修仙', '新手'],
    file_url: null,
    thumbnail_url: null,
    bg_style: '赛博霓虹',
    avatar: '周',
    duration_ms: null,
    uses_count: 3,
    created_by: 'local-demo',
    metadata: {},
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'demo-char-merchant',
    team_id: null,
    type: 'character',
    name: '引路掌柜',
    description: '万界商城的接引者，只在雨夜和霓虹边缘显形，说话像签契约一样冷静。',
    tags: ['神秘', '引导者'],
    file_url: null,
    thumbnail_url: null,
    bg_style: '冷白雾面',
    avatar: '掌',
    duration_ms: null,
    uses_count: 2,
    created_by: 'local-demo',
    metadata: {},
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  },
];
