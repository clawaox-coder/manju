import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';
import type { AssetDTO } from '@/lib/api/assets';
import { loadCanvasPositions } from './persistence';
import { splitScenes } from './sceneSplit';

export interface CanvasNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  // canvas-node-edit-layout:用户手动缩放后的尺寸(从 persistence 复原)。
  // 未设则由 CanvasSync 用 MANJU_NODE_SIZE[type] 默认值兜底。
  size?: { w: number; h: number };
  data?: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
  markerEnd?: { type: string };
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function buildCanvasGraph(
  script: ScriptDTO | undefined,
  shots: ShotDTO[] | undefined,
  characters: AssetDTO[] | undefined,
  projectName: string,
  aiStatus: 'idle' | 'running' | 'done' | 'error' = 'idle',
  onRunAi?: () => void,
  projectId?: string | null,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const scenes = script ? splitScenes(script.content) : [];
  const shotList = shots ?? [];
  const charList = (characters ?? []).slice(0, 6);

  const savedPositions = projectId ? loadCanvasPositions(projectId) : null;
  // 把 saved 的 {x,y,w?,h?} 投到 CanvasNode 的 position + 可选 size。
  // 用户已 saved 的位置/尺寸优先于默认布局/默认尺寸。
  const sized = (id: string, fallback: { x: number; y: number }): Pick<CanvasNode, 'position' | 'size'> => {
    const s = savedPositions?.get(id);
    return {
      position: s ? { x: s.x, y: s.y } : fallback,
      size: s && s.w !== undefined && s.h !== undefined ? { w: s.w, h: s.h } : undefined,
    };
  };

  // --- Script scene nodes (left column) ---
  scenes.forEach((scene, i) => {
    const id = `script-${i}`;
    nodes.push({
      id,
      type: 'script',
      ...sized(id, { x: 0, y: i * 200 }),
      data: {
        sceneNumber: i + 1,
        title: `Script ${String(i + 1).padStart(2, '0')} · ${scene.title}`,
        content: scene.content.slice(0, 120),
      },
    });
  });

  // --- AI generation node (center) — only once there's a script to feed it,
  // otherwise it floats alone over the empty-state and looks broken ---
  if (scenes.length > 0 || shotList.length > 0) {
    const aiY = Math.max(0, (scenes.length * 200 - 200) / 2);
    nodes.push({
      id: 'ai-gen',
      type: 'ai',
      ...sized('ai-gen', { x: 380, y: aiY }),
      data: {
        title: 'Agent Core · Storyboard Director',
        label: 'AI 分镜生成',
        type: 'generate',
        status: aiStatus,
        model: 'Sonnet 4.6',
        onRun: onRunAi,
      },
    });
  }

  // --- Character nodes (top-center) ---
  charList.forEach((char, i) => {
    const id = `char-${char.id}`;
    nodes.push({
      id,
      type: 'character',
      ...sized(id, { x: 350 + (i % 2) * 180, y: -160 + Math.floor(i / 2) * 200 }),
      data: {
        title: `Character · ${char.name}`,
        name: char.name,
        description: char.description || '',
        avatar: char.thumbnail_url || char.avatar || char.file_url,
        tags: char.tags,
      },
    });
    edges.push({
      id: `e-char-${char.id}-ai`,
      source: `char-${char.id}`,
      target: 'ai-gen',
      style: { stroke: '#ec4899', strokeDasharray: '4 2' },
    });
  });

  // --- Storyboard shot nodes (right column) ---
  shotList.forEach((shot, i) => {
    const id = `shot-${shot.id}`;
    nodes.push({
      id,
      type: 'storyboard',
      ...sized(id, { x: 650, y: i * 230 }),
      data: {
        shotNumber: i + 1,
        title: `Shot ${String(i + 1).padStart(2, '0')} · ${shot.title || `镜头 ${i + 1}`}`,
        dialog: shot.dialog || '',
        style: (shot.metadata?.style as string) || '日系动漫',
        imageUrl: shot.image_url,
      },
    });
    edges.push({
      id: `e-ai-shot-${shot.id}`,
      source: 'ai-gen',
      target: `shot-${shot.id}`,
      style: { stroke: '#f59e0b' },
      markerEnd: { type: 'arrowclosed' },
    });
  });

  // --- Script → AI edges ---
  scenes.forEach((_, i) => {
    edges.push({
      id: `e-script-${i}-ai`,
      source: `script-${i}`,
      target: 'ai-gen',
      animated: true,
      style: { stroke: '#a855f7' },
    });
  });

  // --- Video output node ---
  if (shotList.length > 0) {
    const totalMs = shotList.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const videoY = Math.max(0, (shotList.length * 230 - 230) / 2);
    nodes.push({
      id: 'video-out',
      type: 'video',
      ...sized('video-out', { x: 950, y: videoY }),
      data: {
        title: `Video Master · ${projectName || '视频输出'}`,
        duration: formatDuration(totalMs),
        status: 'waiting',
      },
    });
    shotList.forEach((shot) => {
      edges.push({
        id: `e-shot-${shot.id}-vid`,
        source: `shot-${shot.id}`,
        sourceHandle: 'video',
        target: 'video-out',
        targetHandle: 'shots',
        style: { stroke: '#22c55e' },
      });
    });
  }

  return { nodes, edges };
}
