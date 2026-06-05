import { describe, expect, it } from 'vitest';
import { buildRoundedEdgePath, buildBridgePath } from '@/pages/Canvas/layout/edgePath';

describe('canvas edge path', () => {
  it('renders the main route as a continuous bezier curve instead of hard straight segments', () => {
    const path = buildRoundedEdgePath([
      { x: 20, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 120 },
      { x: 220, y: 120 },
    ]);

    expect(path).toContain('C');
    expect((path.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(path.startsWith('M 20 40')).toBe(true);
  });

  it('smooths orthogonal staircases into a fully curved spline without hard elbow segments', () => {
    const path = buildRoundedEdgePath([
      { x: 20, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 120 },
      { x: 220, y: 120 },
    ]);

    // 参考图风格：整条线都是连续曲线，不应再出现直角直线段（' L '）。
    expect(path.includes(' L ')).toBe(false);
    expect((path.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps simple two-point links as directional flow curves', () => {
    const path = buildRoundedEdgePath([
      { x: 80, y: 20 },
      { x: 280, y: 120 },
    ]);

    expect(path).toContain('C');
    expect(path.startsWith('M 80 20')).toBe(true);
    expect(path.endsWith('280 120')).toBe(true);
  });

  it('keeps bridge humps for crossing horizontal segments', () => {
    const path = buildBridgePath(
      {
        a: { x: 40, y: 80 },
        b: { x: 240, y: 80 },
        orientation: 'h',
      },
      [{ edgeId: 'edge-1', x: 140, y: 80, width: 22, height: 10 }],
    );

    expect(path).toContain('C');
    expect(path.startsWith('M 40 80')).toBe(true);
  });
});
