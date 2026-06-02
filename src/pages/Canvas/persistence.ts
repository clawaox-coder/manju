// 画布节点的手动摆位 / 尺寸持久化(localStorage,本设备私有)。
// canvas-node-edit-layout:用户拖动 / 缩放后,CanvasSync 监听 store change
// debounce 300ms 落本文件;buildGraph.ts 加载时与默认布局合并(用户值优先)。
// 跨设备同步不在本期范围。
//
// 兼容性:旧 schema(nodes/edges full state)亦能读出 position(用于平滑迁移)。

const STORAGE_PREFIX = 'manju.canvas.';

export interface PositionRecord {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

interface PositionsSchema {
  v: 2;
  savedAt: string;
  positions: Array<{ id: string } & PositionRecord>;
}

// 旧 schema(v1,save 函数已下线但 localStorage 可能仍存):只取节点 position。
interface LegacySchema {
  nodes?: Array<{ id: string; position?: { x: number; y: number } }>;
}

export function loadCanvasPositions(projectId: string): Map<string, PositionRecord> | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PositionsSchema | LegacySchema;
    const map = new Map<string, PositionRecord>();

    if ('v' in parsed && parsed.v === 2) {
      for (const p of parsed.positions) {
        map.set(p.id, { x: p.x, y: p.y, w: p.w, h: p.h });
      }
      return map;
    }
    // legacy v1: nodes[*].position
    if (Array.isArray((parsed as LegacySchema).nodes)) {
      for (const n of (parsed as LegacySchema).nodes!) {
        if (n.position) map.set(n.id, { x: n.position.x, y: n.position.y });
      }
      return map;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCanvasPositions(projectId: string, positions: Map<string, PositionRecord>): void {
  const payload: PositionsSchema = {
    v: 2,
    savedAt: new Date().toISOString(),
    positions: Array.from(positions.entries()).map(([id, r]) => ({ id, ...r })),
  };
  try {
    localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(payload));
  } catch {
    // localStorage 满 / 隐私模式禁用 → 静默(不影响渲染)
  }
}
