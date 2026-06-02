// 画布节点的手动摆位 / 尺寸持久化(localStorage,本设备私有)。
// canvas-node-edit-layout:用户拖动 / 缩放后,CanvasSync 监听 store change
// debounce 300ms 落本文件;buildGraph.ts 加载时与默认布局合并(用户值优先)。
// 跨设备同步不在本期范围。
//
// 兼容性:旧 schema(nodes/edges full state)亦能读出 position(用于平滑迁移)。

const STORAGE_PREFIX = 'manju.canvas.';
export const USER_ARROW_META_KEY = 'manjuUserArrow';

export interface PositionRecord {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface UserArrowRecord {
  id: string;
  from: string;
  to: string;
}

interface PositionsSchema {
  v: 3;
  savedAt: string;
  positions: Array<{ id: string } & PositionRecord>;
  userArrows: UserArrowRecord[];
}

interface PositionsSchemaV2 {
  v: 2;
  savedAt: string;
  positions: Array<{ id: string } & PositionRecord>;
}

// 旧 schema(v1,save 函数已下线但 localStorage 可能仍存):只取节点 position。
interface LegacySchema {
  nodes?: Array<{ id: string; position?: { x: number; y: number } }>;
}

function getStorageKey(projectId: string): string {
  return STORAGE_PREFIX + projectId;
}

function emptySchema(): PositionsSchema {
  return {
    v: 3,
    savedAt: new Date().toISOString(),
    positions: [],
    userArrows: [],
  };
}

function parseSchema(projectId: string): PositionsSchema | null {
  const raw = localStorage.getItem(getStorageKey(projectId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PositionsSchema | PositionsSchemaV2 | LegacySchema;
    if ('v' in parsed && parsed.v === 3) {
      return {
        v: 3,
        savedAt: parsed.savedAt,
        positions: Array.isArray(parsed.positions) ? parsed.positions : [],
        userArrows: Array.isArray(parsed.userArrows) ? parsed.userArrows : [],
      };
    }
    if ('v' in parsed && parsed.v === 2) {
      return {
        v: 3,
        savedAt: parsed.savedAt,
        positions: Array.isArray(parsed.positions) ? parsed.positions : [],
        userArrows: [],
      };
    }
    if (Array.isArray((parsed as LegacySchema).nodes)) {
      return {
        v: 3,
        savedAt: new Date().toISOString(),
        positions: (parsed as LegacySchema).nodes!
          .filter((n) => !!n.position)
          .map((n) => ({ id: n.id, x: n.position!.x, y: n.position!.y })),
        userArrows: [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSchema(projectId: string, patch: Partial<PositionsSchema>): void {
  const prev = parseSchema(projectId) ?? emptySchema();
  const payload: PositionsSchema = {
    ...prev,
    ...patch,
    v: 3,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(payload));
  } catch {
    // localStorage 满 / 隐私模式禁用 → 静默(不影响渲染)
  }
}

export function loadCanvasPositions(projectId: string): Map<string, PositionRecord> | null {
  const parsed = parseSchema(projectId);
  if (!parsed) return null;
  const map = new Map<string, PositionRecord>();
  for (const p of parsed.positions) {
    map.set(p.id, { x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return map;
}

export function saveCanvasPositions(projectId: string, positions: Map<string, PositionRecord>): void {
  saveSchema(projectId, {
    positions: Array.from(positions.entries()).map(([id, r]) => ({ id, ...r })),
  });
}

export function loadUserArrows(projectId: string): UserArrowRecord[] {
  return parseSchema(projectId)?.userArrows ?? [];
}

export function saveUserArrows(projectId: string, userArrows: UserArrowRecord[]): void {
  saveSchema(projectId, { userArrows });
}
