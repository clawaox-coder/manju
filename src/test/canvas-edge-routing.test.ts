import { describe, expect, it } from 'vitest';
import { buildRenderedRoute, toSegments, type RectLike } from '@/pages/Canvas/layout/edgeRouting';

function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: RectLike,
  padding = 0,
) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
  if (Math.abs(a.x - b.x) < 0.5) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x >= expanded.x
      && a.x <= expanded.x + expanded.w
      && maxY >= expanded.y
      && minY <= expanded.y + expanded.h;
  }
  if (Math.abs(a.y - b.y) < 0.5) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y >= expanded.y
      && a.y <= expanded.y + expanded.h
      && maxX >= expanded.x
      && minX <= expanded.x + expanded.w;
  }
  return false;
}

describe('canvas edge routing', () => {
  it('collapses a clear horizontally-dominant link into a single smooth flow instead of a staircase', () => {
    const from = { x: 0, y: 0, w: 120, h: 80 };
    const to = { x: 360, y: 120, w: 120, h: 80 };

    const route = buildRenderedRoute(from, to, 'edge-flow', []);

    // 无障碍、横向主导：应直接走两点平滑曲线，不再插入正交折点。
    expect(route.length).toBe(2);
  });

  it('routes around blocking nodes instead of cutting through them', () => {
    const from = { x: 0, y: 0, w: 120, h: 80 };
    const to = { x: 340, y: 0, w: 120, h: 80 };
    const obstacle = { x: 150, y: -20, w: 120, h: 140 };

    const route = buildRenderedRoute(from, to, 'edge-a', [obstacle]);
    const segments = toSegments(route);

    expect(segments.length).toBeGreaterThan(2);
    expect(segments.some((segment) => segmentIntersectsRect(segment.a, segment.b, obstacle, 8))).toBe(false);
  });

  it('keeps rendered routes orthogonal after rerouting', () => {
    const from = { x: 40, y: 40, w: 120, h: 80 };
    const to = { x: 160, y: 300, w: 120, h: 80 };

    const route = buildRenderedRoute(from, to, 'edge-b', []);

    expect(route.length).toBeGreaterThanOrEqual(4);
    for (const segment of toSegments(route)) {
      const isHorizontal = Math.abs(segment.a.y - segment.b.y) < 0.5;
      const isVertical = Math.abs(segment.a.x - segment.b.x) < 0.5;
      expect(isHorizontal || isVertical).toBe(true);
    }
  });

  it('fans sibling edges into different corridor lanes instead of stacking them on the same vertical trunk', () => {
    const from = { x: 0, y: 0, w: 120, h: 80 };
    const to = { x: 340, y: 260, w: 120, h: 80 };

    const routeA = buildRenderedRoute(from, to, 'edge-c', [], {
      sourceRank: 0,
      sourceCount: 3,
      targetRank: 0,
      targetCount: 3,
    });
    const routeB = buildRenderedRoute(from, to, 'edge-d', [], {
      sourceRank: 2,
      sourceCount: 3,
      targetRank: 2,
      targetCount: 3,
    });

    const verticalXsA = toSegments(routeA).filter((segment) => segment.orientation === 'v').map((segment) => segment.a.x);
    const verticalXsB = toSegments(routeB).filter((segment) => segment.orientation === 'v').map((segment) => segment.a.x);

    expect(verticalXsA.length).toBeGreaterThan(0);
    expect(verticalXsB.length).toBeGreaterThan(0);
    expect(Math.abs(verticalXsA[0] - verticalXsB[0])).toBeGreaterThanOrEqual(20);
  });
});
