import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, useValue, createShapeId } from 'tldraw';
import { X, Send } from 'lucide-react';
import { resolveNodeEntity, isContentNode, type NodeEntity } from '../nodeEntity';
import { cn } from '@/lib/utils';

export interface NodeOptimizePanelProps {
  nodeId: string;
  onClose: () => void;
  /** P3/P4 由变体接入实际优化;P2 阶段父组件可不传(发送按钮禁用)。 */
  onSubmit?: (instruction: string) => Promise<void>;
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

// P3/P4 之前的占位 —— 变体接入时由本组件按 entity.kind 分发到具体子组件。
function NodeContent({ entity }: { entity: NodeEntity }) {
  if (entity.kind === 'unknown') {
    return <p className="text-[12px] text-muted-foreground">该节点暂不支持优化。</p>;
  }
  return (
    <p className="text-[12px] text-muted-foreground leading-relaxed">
      {isContentNode(entity)
        ? '描述你想要的优化方向,我会按这个改写当前节点。'
        : '这是整体动作控制台,谨慎执行(会影响多个节点)。'}
    </p>
  );
}

export function NodeOptimizePanel({ nodeId, onClose, onSubmit }: NodeOptimizePanelProps) {
  const entity = resolveNodeEntity(nodeId);
  const pos = useAnchorPosition(nodeId);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = useCallback(async () => {
    const text = instruction.trim();
    if (!text || loading || !onSubmit) return;
    setLoading(true);
    try {
      await onSubmit(text);
      setInstruction('');
    } finally {
      setLoading(false);
    }
  }, [instruction, loading, onSubmit]);

  if (!pos) return null;

  const isHub = !isContentNode(entity);
  const canSend = !!instruction.trim() && !loading && !!onSubmit;

  return (
    <div
      className="fixed z-[400] w-[320px] max-h-[420px] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-xl"
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
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        <NodeContent entity={entity} />
      </div>

      <div className="px-3.5 py-2.5 border-t border-border">
        <div className={cn(
          'flex items-center gap-2 rounded-xl border bg-card px-3 py-2 transition',
          'border-border focus-within:border-primary/40',
        )}>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            placeholder={isHub ? '输入指令…' : '描述你想要的优化…'}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
            }}
            disabled={loading}
          />
          <button
            type="button"
            onClick={submit}
            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition shrink-0"
            disabled={!canSend}
            aria-label="发送"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
