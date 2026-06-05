import { useEditor, useValue, createShapeId } from 'tldraw';
import { X } from 'lucide-react';
import { resolveNodeEntity } from '../nodeEntity';
import { CanvasObjectWorkbench, getCanvasObjectTitleFromNodeId } from '../CanvasObjectWorkbench';
import type { CanvasNode } from '../buildGraph';

export interface NodeOptimizePanelProps {
  nodeId: string;
  projectId: string | null;
  onClose: () => void;
}

const PANEL_WIDTH = 320;

// 由 tldraw editor 派生节点旁的屏幕坐标。用 useValue 订阅 reactive store,
// 不在 effect 里 setState(避免 react-hooks/set-state-in-effect)。
// pageToScreen 返屏幕坐标,容器用 fixed 定位直接消费。
//
// canvas-node-edit-layout reactive 契约:selector 内调 getShapePageBounds(shapeId)
// 与 getViewportScreenBounds(),tldraw useValue 会自动订阅其内部读到的所有 reactive
// 值(shape store、camera、viewport)。因此节点被用户拖动 / 缩放、画布平移 / 缩放,
// 都会触发本 hook 重算,面板自动跟随。回归契约由 src/test/panelAnchor.test.ts 把关。
function useAnchorPosition(nodeId: string): { x: number; y: number } | null {
  const editor = useEditor();
  return useValue(
    'panel-anchor',
    () => {
      const bounds = editor.getShapePageBounds(createShapeId(nodeId));
      if (!bounds) return null;
      const right = editor.pageToScreen({ x: bounds.maxX, y: bounds.y });
      const vp = editor.getViewportScreenBounds();
      // 右侧锚定;超出右边界改为左侧。
      let x = right.x + 12;
      if (x + PANEL_WIDTH > vp.maxX) {
        const left = editor.pageToScreen({ x: bounds.x, y: bounds.y });
        x = left.x - 12 - PANEL_WIDTH;
      }
      const y = Math.max(right.y, vp.y + 8);
      return { x, y };
    },
    [editor, nodeId],
  );
}

function inferNodeType(nodeId: string): CanvasNode['type'] {
  const entity = resolveNodeEntity(nodeId);
  switch (entity.kind) {
    case 'script-scene': return 'script';
    case 'shot': return 'storyboard';
    case 'character': return 'character';
    case 'hub-ai': return 'ai';
    case 'hub-video': return 'video';
    case 'decision': return 'decision';
    case 'risk': return 'risk';
    default: return undefined;
  }
}

export function getNodePanelTitle(nodeId: string): string {
  return getCanvasObjectTitleFromNodeId(nodeId);
}

export function NodeInspectorContent({
  nodeId,
  projectId,
  onClose,
}: {
  nodeId: string;
  projectId: string | null;
  onClose: () => void;
}) {
  const node: CanvasNode = {
    id: nodeId,
    type: inferNodeType(nodeId),
    position: { x: 0, y: 0 },
    data: {},
  };
  return <CanvasObjectWorkbench node={node} projectId={projectId} onClose={onClose} />;
}

export function NodeOptimizePanel({ nodeId, projectId, onClose }: NodeOptimizePanelProps) {
  const pos = useAnchorPosition(nodeId);
  if (!pos) return null;

  return (
    <div
      className="fixed z-[400] w-[320px] max-h-[460px] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={getNodePanelTitle(nodeId)}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
        <span className="text-[12px] font-medium truncate">{getNodePanelTitle(nodeId)}</span>
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NodeInspectorContent nodeId={nodeId} projectId={projectId} onClose={onClose} />
      </div>
    </div>
  );
}
