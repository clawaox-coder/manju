import { describe, expect, it } from 'vitest';
import {
  DEMO_CANVAS_PROJECT_ID,
  DEMO_CANVAS_PROJECT_NAME,
  demoCanvasCharacters,
  demoCanvasScript,
  demoCanvasShots,
  isDemoCanvasProjectId,
} from '@/pages/Canvas/demoCanvasData';
import { splitScenes } from '@/pages/Canvas/sceneSplit';

describe('canvas demo data', () => {
  it('provides a stable local demo project identity', () => {
    expect(DEMO_CANVAS_PROJECT_ID).toBe('__demo_canvas__');
    expect(DEMO_CANVAS_PROJECT_NAME).toBeTruthy();
    expect(isDemoCanvasProjectId(DEMO_CANVAS_PROJECT_ID)).toBe(true);
    expect(isDemoCanvasProjectId('real-project-id')).toBe(false);
  });

  it('contains script content that can be split into multiple scenes', () => {
    const scenes = splitScenes(demoCanvasScript.content);

    expect(scenes).toHaveLength(3);
    expect(scenes.map((scene) => scene.title)).toEqual(['开场 · 屋顶误入', '第一笔交易', '代价显形']);
    expect(demoCanvasScript.project_id).toBe(DEMO_CANVAS_PROJECT_ID);
  });

  it('contains storyboard and character demo objects for canvas-first local preview', () => {
    expect(demoCanvasShots).toHaveLength(3);
    expect(demoCanvasShots.every((shot) => shot.project_id === DEMO_CANVAS_PROJECT_ID)).toBe(true);
    expect(demoCanvasCharacters).toHaveLength(2);
    expect(demoCanvasCharacters.every((asset) => asset.type === 'character')).toBe(true);
  });
});
