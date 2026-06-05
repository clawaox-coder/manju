import type { CanvasEdge, CanvasNode } from '../buildGraph';

export type ScreenPoint = { x: number; y: number };

export type RectLike = { x: number; y: number; w: number; h: number };

export type SmartAnchorContext = {
  sourceType?: string;
  targetType?: string;
  sourceRank?: number;
  sourceCount?: number;
  targetRank?: number;
  targetCount?: number;
};

export type EdgeSegment = {
  a: ScreenPoint;
  b: ScreenPoint;
  orientation: 'h' | 'v';
};

const LANE_OFFSETS = [0.18, 0.34, 0.5, 0.66, 0.82] as const;
const PROBE_DISTANCE = 56;
const TERMINAL_OFFSET = 18;
const CORRIDOR_PADDING = 44;
const OBSTACLE_PADDING = 16;

function hashArrowBendSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getAnchorLane(seed: string): number {
  return Math.abs(hashArrowBendSeed(seed)) % LANE_OFFSETS.length;
}

function pointInsideRect(point: ScreenPoint, rect: RectLike, padding = 0) {
  return point.x >= rect.x - padding
    && point.x <= rect.x + rect.w + padding
    && point.y >= rect.y - padding
    && point.y <= rect.y + rect.h + padding;
}

function segmentIntersectsRect(a: ScreenPoint, b: ScreenPoint, rect: RectLike, padding = 0) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
  if (pointInsideRect(a, expanded) || pointInsideRect(b, expanded)) return false;
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return x >= expanded.x
      && x <= expanded.x + expanded.w
      && maxY >= expanded.y
      && minY <= expanded.y + expanded.h;
  }
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return y >= expanded.y
      && y <= expanded.y + expanded.h
      && maxX >= expanded.x
      && minX <= expanded.x + expanded.w;
  }
  return false;
}

function segmentIntersectsExpandedRect(a: ScreenPoint, b: ScreenPoint, rect: RectLike, padding = 0) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };

  if (pointInsideRect(a, expanded) || pointInsideRect(b, expanded)) return true;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 0.000001) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
      return true;
    }
    if (r < t0) return false;
    if (r < t1) t1 = r;
    return true;
  };

  return clip(-dx, a.x - expanded.x)
    && clip(dx, expanded.x + expanded.w - a.x)
    && clip(-dy, a.y - expanded.y)
    && clip(dy, expanded.y + expanded.h - a.y)
    && t0 <= t1;
}

function canUseDirectFlow(
  start: ScreenPoint,
  end: ScreenPoint,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const privileged = Boolean(context?.sourceType === 'ai' || context?.targetType === 'ai');
  // 多分支扇出的连线需要正交走廊分道，避免直连曲线互相重叠；AI 枢纽除外。
  const fanned = (context?.sourceCount ?? 1) > 1 || (context?.targetCount ?? 1) > 1;
  if (fanned && !privileged) return false;
  // 横向主导且通道无遮挡时走单段平滑曲线（参考 n8n / React Flow 的 bezier 观感）。
  const minHorizontal = privileged ? 120 : 150;
  if (dx < Math.max(minHorizontal, dy * 0.9)) return false;
  const padding = 20;
  return !obstacles.some((rect) => segmentIntersectsExpandedRect(start, end, rect, padding));
}

function isVerticalAnchor(anchor: { x: number; y: number }) {
  return anchor.y === 0 || anchor.y === 1;
}

function anchorToPoint(rect: RectLike, anchor: { x: number; y: number }): ScreenPoint {
  return {
    x: rect.x + rect.w * anchor.x,
    y: rect.y + rect.h * anchor.y,
  };
}

function getSmartAnchors(
  fromRect: RectLike,
  toRect: RectLike,
  seed: string,
  context?: SmartAnchorContext,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const lane = getAnchorLane(seed);
  const laneValue = LANE_OFFSETS[lane];
  const sourceHub = context?.sourceType === 'ai' || context?.sourceType === 'video';
  const targetHub = context?.targetType === 'ai' || context?.targetType === 'video';
  const sourceLane = context?.sourceRank != null
    ? LANE_OFFSETS[Math.min(context.sourceRank, LANE_OFFSETS.length - 1)]
    : laneValue;
  const targetLane = context?.targetRank != null
    ? LANE_OFFSETS[Math.min(context.targetRank, LANE_OFFSETS.length - 1)]
    : LANE_OFFSETS[(lane + 1) % LANE_OFFSETS.length];
  const fixedSideLane = 0.5;
  const stronglyHorizontal = Math.abs(dx) >= Math.max(72, Math.abs(dy) * 0.85);
  const stronglyVertical = Math.abs(dy) > Math.abs(dx) * 1.15;

  if (stronglyHorizontal) {
    return dx >= 0
      ? { start: { x: 1, y: fixedSideLane }, end: { x: 0, y: fixedSideLane } }
      : { start: { x: 0, y: fixedSideLane }, end: { x: 1, y: fixedSideLane } };
  }

  if (sourceHub && stronglyVertical) {
    return {
      start: dy >= 0 ? { x: sourceLane, y: 1 } : { x: sourceLane, y: 0 },
      end: Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? { x: 0, y: targetLane } : { x: 1, y: targetLane })
        : (dy >= 0 ? { x: targetLane, y: 0 } : { x: targetLane, y: 1 }),
    };
  }

  if (targetHub && stronglyVertical) {
    return {
      start: Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? { x: 1, y: sourceLane } : { x: 0, y: sourceLane })
        : (dy >= 0 ? { x: sourceLane, y: 1 } : { x: sourceLane, y: 0 }),
      end: dy >= 0 ? { x: targetLane, y: 0 } : { x: targetLane, y: 1 },
    };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: { x: 1, y: fixedSideLane }, end: { x: 0, y: fixedSideLane } }
      : { start: { x: 0, y: fixedSideLane }, end: { x: 1, y: fixedSideLane } };
  }

  return dy >= 0
    ? { start: { x: sourceLane, y: 1 }, end: { x: targetLane, y: 0 } }
    : { start: { x: sourceLane, y: 0 }, end: { x: targetLane, y: 1 } };
}

function getObstacleAwareAnchors(
  fromRect: RectLike,
  toRect: RectLike,
  seed: string,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const anchors = getSmartAnchors(fromRect, toRect, seed, context);
  const start = anchorToPoint(fromRect, anchors.start);
  const end = anchorToPoint(toRect, anchors.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const sideLane = anchors.start.y === 0 || anchors.start.y === 1 ? anchors.start.x : anchors.start.y;
  const endSideLane = anchors.end.y === 0 || anchors.end.y === 1 ? anchors.end.x : anchors.end.y;
  const startProbe = isVerticalAnchor(anchors.start)
    ? { x: start.x, y: start.y + (dy >= 0 ? PROBE_DISTANCE : -PROBE_DISTANCE) }
    : { x: start.x + (dx >= 0 ? PROBE_DISTANCE : -PROBE_DISTANCE), y: start.y };
  const endProbe = isVerticalAnchor(anchors.end)
    ? { x: end.x, y: end.y + (dy >= 0 ? -PROBE_DISTANCE : PROBE_DISTANCE) }
    : { x: end.x + (dx >= 0 ? -PROBE_DISTANCE : PROBE_DISTANCE), y: end.y };

  const startBlocked = obstacles.some((rect) => segmentIntersectsRect(start, startProbe, rect, 14));
  const endBlocked = obstacles.some((rect) => segmentIntersectsRect(end, endProbe, rect, 14));

  if (startBlocked) {
    anchors.start = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? { x: 1, y: sideLane } : { x: 0, y: sideLane })
      : (dx >= 0 ? { x: 1, y: 0.72 } : { x: 0, y: 0.28 });
  }

  if (endBlocked) {
    anchors.end = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? { x: 0, y: endSideLane } : { x: 1, y: endSideLane })
      : (dx >= 0 ? { x: 0, y: 0.28 } : { x: 1, y: 0.72 });
  }

  return anchors;
}

function collectCorridorCandidates(
  axis: 'x' | 'y',
  start: ScreenPoint,
  end: ScreenPoint,
  fromRect: RectLike,
  toRect: RectLike,
  obstacles: RectLike[],
  preferredValue?: number,
) {
  const values = new Set<number>();
  const midpoint = axis === 'x' ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  values.add(midpoint);
  values.add(midpoint - 32);
  values.add(midpoint + 32);
  if (typeof preferredValue === 'number') {
    values.add(preferredValue);
    values.add(preferredValue - 24);
    values.add(preferredValue + 24);
  }

  if (axis === 'x') {
    values.add(Math.max(fromRect.x + fromRect.w, toRect.x + toRect.w) + CORRIDOR_PADDING);
    values.add(Math.min(fromRect.x, toRect.x) - CORRIDOR_PADDING);
    for (const rect of obstacles) {
      values.add(rect.x - CORRIDOR_PADDING);
      values.add(rect.x + rect.w + CORRIDOR_PADDING);
    }
  } else {
    values.add(Math.max(fromRect.y + fromRect.h, toRect.y + toRect.h) + CORRIDOR_PADDING);
    values.add(Math.min(fromRect.y, toRect.y) - CORRIDOR_PADDING);
    for (const rect of obstacles) {
      values.add(rect.y - CORRIDOR_PADDING);
      values.add(rect.y + rect.h + CORRIDOR_PADDING);
    }
  }

  return [...values].filter(Number.isFinite);
}

function getLaneBias(rank: number | undefined, count: number | undefined) {
  if (rank == null || count == null || count <= 1) return 0;
  const center = (count - 1) / 2;
  return (rank - center) / Math.max(center, 1);
}

function getCorridorPreference(
  axis: 'x' | 'y',
  start: ScreenPoint,
  end: ScreenPoint,
  fromRect: RectLike,
  toRect: RectLike,
  context?: SmartAnchorContext,
) {
  const sourceBias = getLaneBias(context?.sourceRank, context?.sourceCount);
  const targetBias = getLaneBias(context?.targetRank, context?.targetCount);
  const combinedBias = sourceBias !== 0 || targetBias !== 0
    ? (sourceBias + targetBias) / ((sourceBias !== 0 && targetBias !== 0) ? 2 : 1)
    : ((getAnchorLane(`${start.x}:${start.y}:${end.x}:${end.y}`) - 2) / 2);
  const span = axis === 'x'
    ? Math.max(Math.abs(end.x - start.x), fromRect.w, toRect.w)
    : Math.max(Math.abs(end.y - start.y), fromRect.h, toRect.h);
  const drift = Math.max(28, Math.min(84, span * 0.18));
  const midpoint = axis === 'x' ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  return midpoint + combinedBias * drift;
}

function scoreRoute(points: ScreenPoint[], obstacles: RectLike[]) {
  let length = 0;
  let intersections = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    intersections += obstacles.filter((rect) => segmentIntersectsRect(a, b, rect, OBSTACLE_PADDING)).length;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    intersections += obstacles.filter((rect) => pointInsideRect(points[i], rect, OBSTACLE_PADDING)).length;
  }
  return intersections * 10_000 + length + (points.length - 2) * 24;
}

function chooseCorridor(
  candidates: number[],
  buildRoute: (value: number) => ScreenPoint[],
  obstacles: RectLike[],
  preferredValue?: number,
) {
  let bestValue = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const value of candidates) {
    const preferencePenalty = typeof preferredValue === 'number' ? Math.abs(value - preferredValue) * 4 : 0;
    const score = scoreRoute(buildRoute(value), obstacles) + preferencePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  return bestValue;
}

function buildHorizontalRoute(
  start: ScreenPoint,
  end: ScreenPoint,
  fromRect: RectLike,
  toRect: RectLike,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const dir = end.x >= start.x ? 1 : -1;
  const exit = { x: start.x + dir * TERMINAL_OFFSET, y: start.y };
  const enter = { x: end.x - dir * TERMINAL_OFFSET, y: end.y };
  const preferredX = getCorridorPreference('x', exit, enter, fromRect, toRect, context);
  const candidates = collectCorridorCandidates('x', exit, enter, fromRect, toRect, obstacles, preferredX);
  const midX = chooseCorridor(candidates, (value) => [
    start,
    exit,
    { x: value, y: exit.y },
    { x: value, y: enter.y },
    enter,
    end,
  ], obstacles, preferredX);

  return [start, exit, { x: midX, y: exit.y }, { x: midX, y: enter.y }, enter, end];
}

function buildVerticalRoute(
  start: ScreenPoint,
  end: ScreenPoint,
  fromRect: RectLike,
  toRect: RectLike,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const dir = end.y >= start.y ? 1 : -1;
  const exit = { x: start.x, y: start.y + dir * TERMINAL_OFFSET };
  const enter = { x: end.x, y: end.y - dir * TERMINAL_OFFSET };
  const preferredY = getCorridorPreference('y', exit, enter, fromRect, toRect, context);
  const candidates = collectCorridorCandidates('y', exit, enter, fromRect, toRect, obstacles, preferredY);
  const midY = chooseCorridor(candidates, (value) => [
    start,
    exit,
    { x: exit.x, y: value },
    { x: enter.x, y: value },
    enter,
    end,
  ], obstacles, preferredY);

  return [start, exit, { x: exit.x, y: midY }, { x: enter.x, y: midY }, enter, end];
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number, padding = 0) {
  const minA = Math.min(a0, a1);
  const maxA = Math.max(a0, a1);
  const minB = Math.min(b0, b1) - padding;
  const maxB = Math.max(b0, b1) + padding;
  return maxA >= minB && minA <= maxB;
}

function addEdgeClearance(points: ScreenPoint[], rects: RectLike[], gap = 14): ScreenPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const next = points.map((point) => ({ ...point }));

  for (let i = 0; i < next.length - 1; i += 1) {
    let j = i + 1;

    if (Math.abs(next[i].x - next[j].x) < 0.5) {
      while (j + 1 < next.length && Math.abs(next[j + 1].x - next[i].x) < 0.5) j += 1;
      const x = next[i].x;
      const y0 = next[i].y;
      const y1 = next[j].y;
      let shift = 0;

      for (const rect of rects) {
        if (!rangesOverlap(y0, y1, rect.y, rect.y + rect.h, 8)) continue;
        const leftDistance = Math.abs(x - rect.x);
        const rightDistance = Math.abs(x - (rect.x + rect.w));
        if (leftDistance <= gap) shift = Math.min(shift, -(gap - leftDistance + 2));
        if (rightDistance <= gap) shift = Math.max(shift, gap - rightDistance + 2);
      }

      if (shift !== 0) {
        for (let k = i; k <= j; k += 1) next[k].x += shift;
      }
      i = j - 1;
      continue;
    }

    if (Math.abs(next[i].y - next[j].y) < 0.5) {
      while (j + 1 < next.length && Math.abs(next[j + 1].y - next[i].y) < 0.5) j += 1;
      const y = next[i].y;
      const x0 = next[i].x;
      const x1 = next[j].x;
      let shift = 0;

      for (const rect of rects) {
        if (!rangesOverlap(x0, x1, rect.x, rect.x + rect.w, 8)) continue;
        const topDistance = Math.abs(y - rect.y);
        const bottomDistance = Math.abs(y - (rect.y + rect.h));
        if (topDistance <= gap) shift = Math.min(shift, -(gap - topDistance + 2));
        if (bottomDistance <= gap) shift = Math.max(shift, gap - bottomDistance + 2);
      }

      if (shift !== 0) {
        for (let k = i; k <= j; k += 1) next[k].y += shift;
      }
      i = j - 1;
    }
  }

  return next;
}

function dedupePoints(points: ScreenPoint[]) {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const prev = points[index - 1];
    return Math.abs(prev.x - point.x) >= 0.5 || Math.abs(prev.y - point.y) >= 0.5;
  });
}

function getLane(anchor: { x: number; y: number }) {
  return anchor.y === 0 || anchor.y === 1 ? anchor.x : anchor.y;
}

function buildAnchorCandidates(
  baseAnchors: { start: { x: number; y: number }; end: { x: number; y: number } },
  fromRect: RectLike,
  toRect: RectLike,
) {
  const sourceLane = getLane(baseAnchors.start);
  const targetLane = getLane(baseAnchors.end);
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const candidates = [
    baseAnchors,
    {
      start: dx >= 0 ? { x: 1, y: sourceLane } : { x: 0, y: sourceLane },
      end: dx >= 0 ? { x: 0, y: targetLane } : { x: 1, y: targetLane },
    },
    {
      start: dy >= 0 ? { x: sourceLane, y: 1 } : { x: sourceLane, y: 0 },
      end: dy >= 0 ? { x: targetLane, y: 0 } : { x: targetLane, y: 1 },
    },
    {
      start: { x: sourceLane, y: 0 },
      end: { x: targetLane, y: 1 },
    },
    {
      start: { x: sourceLane, y: 1 },
      end: { x: targetLane, y: 0 },
    },
  ];

  return candidates.filter((candidate, index, array) => (
    array.findIndex((other) => (
      other.start.x === candidate.start.x
      && other.start.y === candidate.start.y
      && other.end.x === candidate.end.x
      && other.end.y === candidate.end.y
    )) === index
  ));
}

export function buildRenderedRoute(
  fromRect: RectLike,
  toRect: RectLike,
  seed: string,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const anchorCandidates = buildAnchorCandidates(
    getObstacleAwareAnchors(fromRect, toRect, seed, obstacles, context),
    fromRect,
    toRect,
  );
  let bestRoute: ScreenPoint[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const anchors of anchorCandidates) {
    const start = anchorToPoint(fromRect, anchors.start);
    const end = anchorToPoint(toRect, anchors.end);
    if (canUseDirectFlow(start, end, obstacles, context)) {
      return [start, end];
    }
    const routes = [
      buildHorizontalRoute(start, end, fromRect, toRect, obstacles, context),
      buildVerticalRoute(start, end, fromRect, toRect, obstacles, context),
    ];
    for (const route of routes) {
      const score = scoreRoute(route, obstacles);
      if (score < bestScore) {
        bestScore = score;
        bestRoute = route;
      }
    }
  }

  return dedupePoints(addEdgeClearance(bestRoute ?? [], [fromRect, toRect, ...obstacles], 14));
}

export function getRouteAnchors(
  fromRect: RectLike,
  toRect: RectLike,
  seed: string,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  return getObstacleAwareAnchors(fromRect, toRect, seed, obstacles, context);
}

export function toSegments(points: ScreenPoint[]): EdgeSegment[] {
  const segments: EdgeSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue;
    segments.push({
      a,
      b,
      orientation: Math.abs(a.y - b.y) < Math.abs(a.x - b.x) ? 'h' : 'v',
    });
  }
  return segments;
}

export function buildEdgeContextMap(graph: { nodes: CanvasNode[]; edges: CanvasEdge[] }) {
  const graphNodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoingRankMap = new Map<string, number>();
  const incomingRankMap = new Map<string, number>();
  const outgoingCountMap = new Map<string, number>();
  const incomingCountMap = new Map<string, number>();
  const edgeContextMap = new Map<string, SmartAnchorContext>();
  const outgoingGroups = new Map<string, CanvasEdge[]>();
  const incomingGroups = new Map<string, CanvasEdge[]>();

  for (const edge of graph.edges) {
    outgoingGroups.set(edge.source, [...(outgoingGroups.get(edge.source) ?? []), edge]);
    incomingGroups.set(edge.target, [...(incomingGroups.get(edge.target) ?? []), edge]);
  }
  for (const [sourceId, edges] of outgoingGroups) {
    const sorted = [...edges].sort((a, b) => {
      const ay = graphNodeMap.get(a.target)?.position?.y ?? 0;
      const by = graphNodeMap.get(b.target)?.position?.y ?? 0;
      return ay - by;
    });
    outgoingCountMap.set(sourceId, sorted.length);
    sorted.forEach((edge, index) => outgoingRankMap.set(edge.id, index));
  }
  for (const [targetId, edges] of incomingGroups) {
    const sorted = [...edges].sort((a, b) => {
      const ay = graphNodeMap.get(a.source)?.position?.y ?? 0;
      const by = graphNodeMap.get(b.source)?.position?.y ?? 0;
      return ay - by;
    });
    incomingCountMap.set(targetId, sorted.length);
    sorted.forEach((edge, index) => incomingRankMap.set(edge.id, index));
  }
  for (const edge of graph.edges) {
    edgeContextMap.set(edge.id, {
      sourceType: graphNodeMap.get(edge.source)?.type,
      targetType: graphNodeMap.get(edge.target)?.type,
      sourceRank: outgoingRankMap.get(edge.id),
      sourceCount: outgoingCountMap.get(edge.source),
      targetRank: incomingRankMap.get(edge.id),
      targetCount: incomingCountMap.get(edge.target),
    });
  }
  return edgeContextMap;
}
