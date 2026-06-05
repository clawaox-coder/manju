import { describe, expect, it } from 'vitest';
import { deriveCanvasState } from '@/pages/Canvas/canvasDerivedState';
import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';
import type { AssetDTO } from '@/lib/api/assets';

function makeScript(overrides: Partial<ScriptDTO> = {}): ScriptDTO {
  return {
    project_id: 'p1',
    content: '场景一\n主角登场。\n\n场景二\n冲突升级。',
    format: 'screenplay',
    word_count: 20,
    scene_count: 2,
    version_no: 1,
    updated_by: 'u1',
    updated_at: '2026-06-03T10:00:00.000Z',
    ...overrides,
  };
}

function makeShot(id: string, overrides: Partial<ShotDTO> = {}): ShotDTO {
  return {
    id,
    project_id: 'p1',
    order_index: 0,
    num: '01',
    title: `镜头 ${id}`,
    shot_type: 'close',
    duration_ms: 3000,
    dialog: null,
    image_url: null,
    bg_style: null,
    voice_id: null,
    metadata: {},
    created_at: '2026-06-03T09:00:00.000Z',
    updated_at: '2026-06-03T09:30:00.000Z',
    ...overrides,
  };
}

function makeCharacter(id: string, overrides: Partial<AssetDTO> = {}): AssetDTO {
  return {
    id,
    team_id: null,
    type: 'character',
    name: `角色 ${id}`,
    description: '角色设定',
    tags: [],
    file_url: null,
    thumbnail_url: null,
    bg_style: null,
    avatar: null,
    duration_ms: null,
    uses_count: 0,
    created_by: null,
    metadata: {},
    created_at: '2026-06-03T09:00:00.000Z',
    updated_at: '2026-06-03T09:00:00.000Z',
    ...overrides,
  };
}

describe('deriveCanvasState', () => {
  it('marks storyboard shots stale when script is newer than shots', () => {
    const state = deriveCanvasState({
      stage: 'storyboard',
      script: makeScript({ updated_at: '2026-06-03T10:00:00.000Z' }),
      shots: [makeShot('s1', { updated_at: '2026-06-03T09:00:00.000Z' })],
      characters: [],
      aiStatus: 'idle',
      hasVoice: false,
      hasVideo: false,
    });

    expect(state.shotStatus['shot-s1']).toBe('stale');
    expect(state.aiStatus).toBe('warning');
    expect(state.videoStatus).toBe('stale');
    expect(state.risks.some((risk) => risk.id === 'risk-script-shot-stale')).toBe(true);
    expect(state.decisions.some((decision) => decision.id === 'decision-refresh-storyboard')).toBe(true);
  });

  it('marks missing character imagery as warning and preserves ready characters', () => {
    const state = deriveCanvasState({
      stage: 'storyboard',
      script: makeScript(),
      shots: [],
      characters: [
        makeCharacter('c1'),
        makeCharacter('c2', { thumbnail_url: 'https://example.com/char.png' }),
      ],
      aiStatus: 'idle',
      hasVoice: false,
      hasVideo: false,
    });

    expect(state.characterStatus['char-c1']).toBe('warning');
    expect(state.characterStatus['char-c2']).toBe('ready');
  });

  it('keeps output in warning when storyboard exists but voice is still missing', () => {
    const state = deriveCanvasState({
      stage: 'voice',
      script: makeScript(),
      shots: [makeShot('s1', { updated_at: '2026-06-03T10:30:00.000Z' })],
      characters: [],
      aiStatus: 'idle',
      hasVoice: false,
      hasVideo: false,
    });

    expect(state.shotStatus['shot-s1']).toBe('warning');
    expect(state.videoStatus).toBe('warning');
    expect(state.risks.some((risk) => risk.id === 'risk-voice-gap')).toBe(true);
    expect(state.decisions.some((decision) => decision.id === 'decision-confirm-voice')).toBe(true);
  });

  it('surfaces active generation on the AI hub while output remains waiting', () => {
    const state = deriveCanvasState({
      stage: 'storyboard',
      script: makeScript(),
      shots: [],
      characters: [],
      aiStatus: 'running',
      hasVoice: false,
      hasVideo: false,
    });

    expect(state.aiStatus).toBe('generating');
    expect(state.videoStatus).toBe('waiting');
  });
});
