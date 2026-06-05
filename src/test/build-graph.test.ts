import { describe, expect, it } from 'vitest';
import { buildCanvasGraph } from '@/pages/Canvas/buildGraph';
import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';
import type { AssetDTO } from '@/lib/api/assets';
import type { DerivedCanvasState } from '@/pages/Canvas/canvasDerivedState';

function makeScript(): ScriptDTO {
  return {
    project_id: 'p1',
    content: '场景一\n主角登场。\n\n场景二\n冲突升级。',
    format: 'screenplay',
    word_count: 20,
    scene_count: 2,
    version_no: 1,
    updated_by: 'u1',
    updated_at: '2026-06-04T08:00:00.000Z',
  };
}

function makeShot(id: string): ShotDTO {
  return {
    id,
    project_id: 'p1',
    order_index: 0,
    num: '01',
    title: `镜头 ${id}`,
    shot_type: 'close',
    duration_ms: 3000,
    dialog: '你好',
    image_url: null,
    bg_style: null,
    voice_id: null,
    metadata: {},
    created_at: '2026-06-04T07:00:00.000Z',
    updated_at: '2026-06-04T07:30:00.000Z',
  };
}

function makeCharacter(id: string): AssetDTO {
  return {
    id,
    team_id: null,
    type: 'character',
    name: `角色 ${id}`,
    description: '角色设定',
    tags: [],
    file_url: null,
    thumbnail_url: 'https://example.com/char.png',
    bg_style: null,
    avatar: null,
    duration_ms: null,
    uses_count: 0,
    created_by: null,
    metadata: {},
    created_at: '2026-06-04T07:00:00.000Z',
    updated_at: '2026-06-04T07:00:00.000Z',
  };
}

describe('buildCanvasGraph', () => {
  it('adds a generic gate node when the project still needs a script direction', () => {
    const graph = buildCanvasGraph(
      undefined,
      [],
      [],
      '项目 A',
      'idle',
      undefined,
      null,
      undefined,
      undefined,
    );

    const gateNode = graph.nodes.find((node) => node.id === 'gate-script');
    expect(gateNode?.type).toBe('decision');
    expect(gateNode?.data?.kind).toBe('generate_script');
    expect(gateNode?.data?.badge).toBe('主线推进');
  });

  it('adds visible coordination objects for derived decisions and risks', () => {
    const derivedState: DerivedCanvasState = {
      sceneStatus: { 'script-0': 'locked', 'script-1': 'locked' },
      shotStatus: { 'shot-s1': 'stale' },
      characterStatus: { 'char-c1': 'ready' },
      aiStatus: 'warning',
      videoStatus: 'warning',
      decisions: [
        {
          id: 'decision-confirm-voice',
          kind: 'match_voice',
          label: '确定整体声音策略并进入配音',
          targetIds: ['shot-s1'],
        },
      ],
      risks: [
        {
          id: 'risk-script-shot-stale',
          kind: 'stale_dependency',
          label: '剧本比现有分镜更新，部分镜头需要重新确认或刷新',
          targetIds: ['shot-s1'],
        },
      ],
    };

    const graph = buildCanvasGraph(
      makeScript(),
      [makeShot('s1')],
      [makeCharacter('c1')],
      '项目 A',
      'idle',
      undefined,
      null,
      derivedState,
      undefined,
    );

    const decisionNode = graph.nodes.find((node) => node.id === 'decision-confirm-voice');
    const riskNode = graph.nodes.find((node) => node.id === 'risk-script-shot-stale');

    expect(decisionNode?.type).toBe('decision');
    expect(decisionNode?.data?.status).toBe('candidate');
    expect(riskNode?.type).toBe('risk');
    expect(riskNode?.data?.status).toBe('stale');
    expect(graph.edges.some((edge) => edge.source === 'decision-confirm-voice' && edge.target === 'shot-s1')).toBe(true);
    expect(graph.edges.some((edge) => edge.source === 'risk-script-shot-stale' && edge.target === 'shot-s1')).toBe(true);
  });

  it('adds a generic storyboard gate when script exists but storyboard has not started', () => {
    const graph = buildCanvasGraph(
      makeScript(),
      [],
      [],
      '项目 A',
      'idle',
      undefined,
      null,
      undefined,
      undefined,
    );

    const gateNode = graph.nodes.find((node) => node.id === 'gate-storyboard');
    expect(gateNode?.type).toBe('decision');
    expect(gateNode?.data?.kind).toBe('generate_storyboard');
    expect(graph.edges.some((edge) => edge.source === 'gate-storyboard' && edge.target === 'script-0')).toBe(true);
  });

  it('adds a render gate when voice is ready but output is not generated yet', () => {
    const voicedShot = { ...makeShot('s1'), voice_id: 'voice-1' };
    const graph = buildCanvasGraph(
      makeScript(),
      [voicedShot],
      [],
      '项目 A',
      'idle',
      undefined,
      null,
      undefined,
      { hasVoice: true, hasVideo: false },
    );

    const gateNode = graph.nodes.find((node) => node.id === 'gate-video');
    expect(gateNode?.type).toBe('decision');
    expect(gateNode?.data?.kind).toBe('render_video');
    expect(graph.edges.some((edge) => edge.source === 'gate-video' && edge.target === 'video-out')).toBe(true);
  });

  it('does not duplicate the ordinal when a shot title already includes it', () => {
    const graph = buildCanvasGraph(
      makeScript(),
      [{ ...makeShot('s1'), title: 'Shot 01 · 屋顶误入' }],
      [],
      '项目 A',
      'idle',
      undefined,
      null,
      undefined,
      undefined,
    );

    const shotNode = graph.nodes.find((node) => node.id === 'shot-s1');
    expect(shotNode?.data?.title).toBe('Shot 01 · 屋顶误入');
  });
});
