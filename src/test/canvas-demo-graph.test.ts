import { describe, expect, it } from 'vitest';
import { buildCanvasGraph } from '@/pages/Canvas/buildGraph';
import { deriveCanvasState } from '@/pages/Canvas/canvasDerivedState';
import {
  DEMO_CANVAS_PROJECT_ID,
  DEMO_CANVAS_PROJECT_NAME,
  demoCanvasCharacters,
  demoCanvasScript,
  demoCanvasShots,
} from '@/pages/Canvas/demoCanvasData';

describe('Canvas demo graph', () => {
  it('keeps script, storyboard, and character objects visible when local canvas falls back to demo data', () => {
    const derivedState = deriveCanvasState({
      stage: 'storyboard',
      script: demoCanvasScript,
      shots: demoCanvasShots,
      characters: demoCanvasCharacters,
      aiStatus: 'idle',
      hasVoice: false,
      hasVideo: false,
    });

    const graph = buildCanvasGraph(
      demoCanvasScript,
      demoCanvasShots,
      demoCanvasCharacters,
      DEMO_CANVAS_PROJECT_NAME,
      'idle',
      undefined,
      DEMO_CANVAS_PROJECT_ID,
      derivedState,
      { hasVoice: false, hasVideo: false },
    );

    const nodeTypes = new Set(graph.nodes.map((node) => node.type));

    expect(nodeTypes.has('script')).toBe(true);
    expect(nodeTypes.has('storyboard')).toBe(true);
    expect(nodeTypes.has('character')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'script-0' && node.data?.title === 'Script 01 · 开场 · 屋顶误入')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'shot-demo-shot-01' && node.data?.title === 'Shot 01 · 屋顶误入')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'char-demo-char-zhoulin' && node.data?.name === '周临')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'ai-gen')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'decision-confirm-voice' && node.type === 'decision')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'risk-voice-gap' && node.type === 'risk')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'gate-script')).toBe(false);
  });
});
