import type { EdgeSegment, ScreenPoint } from './edgeRouting';

export type BridgeMarker = {
  edgeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function simplifyPoints(points: ScreenPoint[]) {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const collinearX = Math.abs(prev.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5;
    const collinearY = Math.abs(prev.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5;
    if (!collinearX && !collinearY) simplified.push(current);
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

// Catmull-Rom 张力：1/6 等价于标准 Catmull-Rom（切线 = (P[i+1]-P[i-1])/2）。
const SPLINE_TENSION = 1 / 6;
// 控制手柄沿当前段方向的长度上限 = 段长 × 此系数。
const HANDLE_CLAMP_RATIO = 0.4;
// 控制手柄垂直当前段方向的分量上限（像素）。直接封顶拐角鼓包，
// 避免远端拐点把短段的控制点拽到侧面、形成可见的波浪过冲。
const MAX_CORNER_BULGE = 9;

// 把控制手柄分解到「沿段」与「垂直段」两个方向分别夹紧：沿向限制在段长内防止纵向过冲，
// 垂向限制成小值，让拐角圆润但不向外鼓包。
function shapeHandle(
  hx: number,
  hy: number,
  ux: number,
  uy: number,
  maxAlong: number,
  maxPerp: number,
) {
  const along = hx * ux + hy * uy;
  const px = hx - along * ux;
  const py = hy - along * uy;
  const perpLen = Math.hypot(px, py);
  const a = Math.max(-maxAlong, Math.min(maxAlong, along));
  const k = perpLen > maxPerp && perpLen > 1e-6 ? maxPerp / perpLen : 1;
  return { x: a * ux + px * k, y: a * uy + py * k };
}

function clampFlowHandle(distanceValue: number) {
  return Math.max(18, Math.min(120, distanceValue * 0.28));
}

// 两点直连：沿主导轴拉出水平/垂直切线手柄，形成参考图那种舒展的 S 形曲线。
function buildTwoPointFlowPath(start: ScreenPoint, end: ScreenPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const handle = clampFlowHandle(Math.abs(dx));
    return `M ${start.x} ${start.y} C ${start.x + handle} ${start.y} ${end.x - handle} ${end.y} ${end.x} ${end.y}`;
  }
  const handle = clampFlowHandle(Math.abs(dy));
  const sign = Math.sign(dy || 1);
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + sign * handle} ${end.x} ${end.y - sign * handle} ${end.x} ${end.y}`;
}

export function shouldUseDirectVisualPath(points: ScreenPoint[]) {
  if (points.length < 2) return false;
  const guidePoints = simplifyPoints(points);
  return guidePoints.length <= 2;
}

// 把正交路由拐点串成一条 C1 连续的三次贝塞尔样条。端点切线对齐首尾段方向，
// 因此连线沿节点的离开/进入方向自然延伸，中间拐点被磨成连续弧线而非直角台阶。
function buildSplinePath(points: ScreenPoint[]) {
  if (points.length < 2) return '';
  if (points.length === 2) return buildTwoPointFlowPath(points[0], points[1]);

  // 端点复制：首尾切线退化为首/末段方向。
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))];
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const maxAlong = segLen * HANDLE_CLAMP_RATIO;
    // 当前段单位方向：把控制手柄拆成沿向/垂向分别夹紧。
    const ux = segLen > 1e-6 ? (p2.x - p1.x) / segLen : 0;
    const uy = segLen > 1e-6 ? (p2.y - p1.y) / segLen : 0;
    const h1 = shapeHandle((p2.x - p0.x) * SPLINE_TENSION, (p2.y - p0.y) * SPLINE_TENSION, ux, uy, maxAlong, MAX_CORNER_BULGE);
    const h2 = shapeHandle((p3.x - p1.x) * SPLINE_TENSION, (p3.y - p1.y) * SPLINE_TENSION, ux, uy, maxAlong, MAX_CORNER_BULGE);
    const c1x = p1.x + h1.x;
    const c1y = p1.y + h1.y;
    const c2x = p2.x - h2.x;
    const c2y = p2.y - h2.y;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function buildRoundedEdgePath(points: ScreenPoint[]) {
  if (points.length < 2) return '';
  const guidePoints = simplifyPoints(points);
  if (shouldUseDirectVisualPath(guidePoints)) {
    return buildTwoPointFlowPath(guidePoints[0], guidePoints[guidePoints.length - 1]);
  }
  return buildSplinePath(guidePoints);
}

export function buildBridgePath(segment: EdgeSegment, bridges: BridgeMarker[]) {
  const sorted = [...bridges].sort((a, b) => a.x - b.x);
  const left = Math.min(segment.a.x, segment.b.x);
  const right = Math.max(segment.a.x, segment.b.x);
  let d = `M ${left} ${segment.a.y}`;
  let cursor = left;
  for (const bridge of sorted) {
    const startX = Math.max(cursor, bridge.x - bridge.width / 2);
    const endX = Math.min(right, bridge.x + bridge.width / 2);
    if (startX <= cursor || endX <= startX) continue;
    d += ` L ${startX} ${segment.a.y}`;
    d += ` C ${startX + bridge.width * 0.18} ${segment.a.y} ${bridge.x - bridge.width * 0.18} ${bridge.y - bridge.height} ${bridge.x} ${bridge.y - bridge.height}`;
    d += ` C ${bridge.x + bridge.width * 0.18} ${bridge.y - bridge.height} ${endX - bridge.width * 0.18} ${segment.a.y} ${endX} ${segment.a.y}`;
    cursor = endX;
  }
  d += ` L ${right} ${segment.a.y}`;
  return d;
}
