import { useEditor, useValue, createShapeId } from 'tldraw';
import { X } from 'lucide-react';
import { resolveNodeEntity, type NodeEntity } from '../nodeEntity';
import { ScriptSceneVariant } from './variants/ScriptSceneVariant';
import { ShotVariant } from './variants/ShotVariant';
import { PlaceholderVariant } from './variants/PlaceholderVariant';

export interface NodeOptimizePanelProps {
  nodeId: string;
  projectId: string | null;
  onClose: () => void;
}

const PANEL_WIDTH = 320;

// 由 tldraw editor 派生节点旁的屏幕坐标。用 useValue 订阅 reactive store,
// 不在 effect 里 setState(避免 react-hooks/set-state-in-effect)。
// pageToScreen 返屏幕坐标,容器用 fixed 定位直接消费。
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

function panelTitle(entity: NodeEntity): string {
  switch (entity.kind) {
    case 'script-scene': return `剧本 · 场 ${entity.sceneIndex + 1}`;
    case 'shot': return '分镜';
    case 'character': return '角色';
    case 'hub-ai': return 'AI 核心 · 整体动作';
    case 'hub-video': return '视频输出 · 整体动作';
    default: return '节点';
  }
}

// 按 entity.kind 分发到具体变体。每个变体自管输入/按钮/状态,因为各类型形态差异大
// (剧本场=纯文本重写、分镜=对白+时长+图、角色=AI+直改名、枢纽=二次确认按钮),
// 共享一个 InputBar 反而是错误抽象。
function NodeContent({ entity, projectId, onClose }: { entity: NodeEntity; projectId: string | null; onClose: () => void }) {
  if (!projectId) {
    return <PlaceholderVariant text="未选择项目,无法优化。" />;
  }
  switch (entity.kind) {
    case 'script-scene':
      return <ScriptSceneVariant sceneIndex={entity.sceneIndex} projectId={projectId} onDone={onClose} />;
    case 'shot':
      return <ShotVariant shotId={entity.shotId} projectId={projectId} />;
    case 'character':
    case 'hub-ai':
    case 'hub-video':
      return <PlaceholderVariant text="此类型节点优化即将上线(P3/P4)。" />;
    default:
      return <PlaceholderVariant text="该节点暂不支持优化。" />;
  }
}

export function NodeOptimizePanel({ nodeId, projectId, onClose }: NodeOptimizePanelProps) {
  const entity = resolveNodeEntity(nodeId);
  const pos = useAnchorPosition(nodeId);
  if (!pos) return null;

  return (
    <div
      className="fixed z-[400] w-[320px] max-h-[460px] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={panelTitle(entity)}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
        <span className="text-[12px] font-medium truncate">{panelTitle(entity)}</span>
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
        <NodeContent entity={entity} projectId={projectId} onClose={onClose} />
      </div>
    </div>
  );
}
