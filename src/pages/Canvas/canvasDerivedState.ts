import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';
import type { AssetDTO } from '@/lib/api/assets';
import type { Stage } from './agent/types';

type NodeStatus = 'draft' | 'candidate' | 'selected' | 'locked' | 'generating' | 'ready' | 'stale' | 'warning' | 'archived' | 'idle' | 'waiting';

export interface DerivedCanvasState {
  sceneStatus: Record<string, NodeStatus>;
  shotStatus: Record<string, NodeStatus>;
  characterStatus: Record<string, NodeStatus>;
  aiStatus: NodeStatus;
  videoStatus: NodeStatus;
  risks: Array<{ id: string; kind: string; label: string; targetIds: string[] }>;
  decisions: Array<{ id: string; kind: string; label: string; targetIds: string[] }>;
}

function isNewer(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return false;
  return aTime > bTime;
}

function sceneCount(content?: string | null): number {
  if (!content) return 0;
  return content.split(/\n{2,}/).filter(Boolean).length;
}

export function deriveCanvasState({
  stage,
  script,
  shots,
  characters,
  aiStatus,
  hasVoice,
  hasVideo,
}: {
  stage: Stage;
  script: ScriptDTO | undefined;
  shots: ShotDTO[] | undefined;
  characters: AssetDTO[] | undefined;
  aiStatus: 'idle' | 'running' | 'done' | 'error';
  hasVoice: boolean;
  hasVideo: boolean;
}): DerivedCanvasState {
  const shotList = shots ?? [];
  const charList = (characters ?? []).slice(0, 6);
  const sceneTotal = sceneCount(script?.content);
  const sceneStatus: Record<string, NodeStatus> = {};
  const shotStatus: Record<string, NodeStatus> = {};
  const characterStatus: Record<string, NodeStatus> = {};
  const risks: DerivedCanvasState['risks'] = [];
  const decisions: DerivedCanvasState['decisions'] = [];

  const shotsNeedRefresh = !!script?.updated_at && shotList.some((shot) => isNewer(script.updated_at, shot.updated_at));
  const hasStoryboard = shotList.length > 0;

  for (let i = 0; i < sceneTotal; i += 1) {
    sceneStatus[`script-${i}`] = script ? (hasStoryboard ? 'locked' : 'ready') : 'draft';
  }

  for (const shot of shotList) {
    const staleByScript = !!script?.updated_at && isNewer(script.updated_at, shot.updated_at);
    const warningByVoice = !hasVoice && (stage === 'voice' || stage === 'video');
    shotStatus[`shot-${shot.id}`] = staleByScript
      ? 'stale'
      : warningByVoice
        ? 'warning'
        : 'ready';
  }

  for (const char of charList) {
    characterStatus[`char-${char.id}`] = char.thumbnail_url || char.avatar || char.file_url ? 'ready' : 'warning';
  }

  if (shotsNeedRefresh) {
    risks.push({
      id: 'risk-script-shot-stale',
      kind: 'stale_dependency',
      label: '剧本比现有分镜更新，部分镜头需要重新确认或刷新',
      targetIds: shotList.map((shot) => `shot-${shot.id}`),
    });
    decisions.push({
      id: 'decision-refresh-storyboard',
      kind: 'refresh_storyboard',
      label: '决定是否按最新剧本刷新受影响分镜',
      targetIds: shotList.map((shot) => `shot-${shot.id}`),
    });
  }

  if (hasStoryboard && !hasVoice) {
    risks.push({
      id: 'risk-voice-gap',
      kind: 'missing_voice',
      label: '分镜已生成，但声音策略尚未确认',
      targetIds: shotList.map((shot) => `shot-${shot.id}`),
    });
    decisions.push({
      id: 'decision-confirm-voice',
      kind: 'match_voice',
      label: '确定整体声音策略并进入配音',
      targetIds: shotList.map((shot) => `shot-${shot.id}`),
    });
  }

  const aiNodeStatus: NodeStatus = aiStatus === 'running'
    ? 'generating'
    : aiStatus === 'error'
      ? 'warning'
      : shotsNeedRefresh
        ? 'warning'
        : script
          ? hasStoryboard ? 'ready' : 'locked'
          : 'idle';

  const videoNodeStatus: NodeStatus = hasVideo
    ? 'ready'
    : shotsNeedRefresh
      ? 'stale'
      : hasStoryboard && !hasVoice
        ? 'warning'
        : hasStoryboard
          ? 'ready'
          : 'waiting';

  return {
    sceneStatus,
    shotStatus,
    characterStatus,
    aiStatus: aiNodeStatus,
    videoStatus: videoNodeStatus,
    risks,
    decisions,
  };
}
