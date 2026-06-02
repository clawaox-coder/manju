import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadCanvasPositions,
  loadUserArrows,
  saveCanvasPositions,
  saveUserArrows,
  USER_ARROW_META_KEY,
} from '@/pages/Canvas/persistence';

describe('canvas user arrow persistence', () => {
  const projectId = 'project-1';
  const storageKey = `manju.canvas.${projectId}`;

  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates v2 schema to positions + empty userArrows', () => {
    localStorage.setItem(storageKey, JSON.stringify({
      v: 2,
      savedAt: '2026-06-02T00:00:00.000Z',
      positions: [{ id: 'script-1', x: 12, y: 34, w: 300, h: 200 }],
    }));

    const positions = loadCanvasPositions(projectId);
    expect(positions?.get('script-1')).toEqual({ x: 12, y: 34, w: 300, h: 200 });
    expect(loadUserArrows(projectId)).toEqual([]);
  });

  it('round-trips saveUserArrows/loadUserArrows without clobbering positions', () => {
    const positions = new Map([['script-1', { x: 100, y: 200, w: 320, h: 180 }]]);
    saveCanvasPositions(projectId, positions);

    saveUserArrows(projectId, [
      { id: 'arrow-a', from: 'script-1', to: 'shot-1' },
      { id: 'arrow-b', from: 'shot-1', to: 'video-hub' },
    ]);

    expect(loadUserArrows(projectId)).toEqual([
      { id: 'arrow-a', from: 'script-1', to: 'shot-1' },
      { id: 'arrow-b', from: 'shot-1', to: 'video-hub' },
    ]);
    expect(loadCanvasPositions(projectId)?.get('script-1')).toEqual({
      x: 100, y: 200, w: 320, h: 180,
    });
  });

  it('keeps arrow meta key stable for canvas tagging', () => {
    expect(USER_ARROW_META_KEY).toBe('manjuUserArrow');
  });
});
