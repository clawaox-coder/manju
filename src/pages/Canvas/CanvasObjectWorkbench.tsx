import type { ReactNode } from 'react';
import type { CanvasNode } from './buildGraph';
import { resolveNodeEntity } from './nodeEntity';
import { getNodeLabel, getNodeStatus } from './focusContext';
import { WorkbenchPlaceholder } from './workbench/WorkbenchPlaceholder';
import { ScriptSceneEditor } from './workbench/editors/ScriptSceneEditor';
import { StoryboardCardEditor } from './workbench/editors/StoryboardCardEditor';
import { CharacterProfileEditor } from './workbench/editors/CharacterProfileEditor';
import { StoryboardHubEditor } from './workbench/editors/StoryboardHubEditor';
import { OutputVersionEditor } from './workbench/editors/OutputVersionEditor';

type WorkbenchOverview = {
  summary: string;
  fields: Array<{ label: string; value: string }>;
  suggestedActions: string[];
};

function asText(value: unknown, fallback = '未设置') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function statusLabel(status: string) {
  switch (status) {
    case 'draft': return '草稿';
    case 'candidate': return '候选';
    case 'selected': return '当前焦点';
    case 'locked': return '已锁定';
    case 'generating': return '生成中';
    case 'ready': return '就绪';
    case 'stale': return '待刷新';
    case 'warning': return '需确认';
    case 'waiting': return '等待';
    case 'idle': return '待命';
    case 'done': return '完成';
    default: return status || '未知';
  }
}

function WorkbenchSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      {children}
    </section>
  );
}

function buildOverview(node: CanvasNode): WorkbenchOverview {
  const data = node.data ?? {};
  const status = statusLabel(getNodeStatus(node));
  switch (node.type) {
    case 'script':
      return {
        summary: '这是当前剧本结构里的一个场次对象，适合先判断这一场是不是还要改，再决定是否继续分镜。',
        fields: [
          { label: '当前状态', value: status },
          { label: '场次编号', value: asText(data.sceneNumber, '未标记') },
          { label: '场次摘要', value: asText(data.content, '等待补充内容') },
        ],
        suggestedActions: ['先改这一场的节奏或冲突', '确认这场是否已经能进入分镜', '如果整体方向变了，优先回到剧本主线'],
      };
    case 'storyboard':
      return {
        summary: '这是一个分镜对象，适合围绕镜头表达、对白节奏和画面一致性做局部决策。',
        fields: [
          { label: '当前状态', value: status },
          { label: '画面风格', value: asText(data.style, '未设风格') },
          { label: '当前对白', value: asText(data.dialog, '暂无对白') },
        ],
        suggestedActions: ['先确认这镜是否需要重画', '对白和时长可以直接在下面微调', '如果这镜失效，优先刷新再继续配音'],
      };
    case 'character':
      return {
        summary: '这是一个角色对象，右侧适合先确认设定和头像一致性，再判断是否会影响分镜风格。',
        fields: [
          { label: '当前状态', value: status },
          { label: '角色名称', value: asText(data.name ?? data.title, '未命名角色') },
          { label: '角色描述', value: asText(data.description, '暂无描述') },
        ],
        suggestedActions: ['先改设定，再决定是否重画头像', '角色名确认后再继续配音和分镜', '如果角色变化大，要回看受影响镜头'],
      };
    case 'ai':
      return {
        summary: '这是分镜生成枢纽，适合围绕“是否现在就该整体重生成”做判断，而不是改单个局部。',
        fields: [
          { label: '当前状态', value: status },
          { label: '当前模型', value: asText(data.model, '默认模型') },
          { label: '当前对象', value: asText(data.label ?? data.title, '整体分镜生成') },
        ],
        suggestedActions: ['只有当整体方向变动时再重生成', '局部问题优先在单镜里修', '执行前先判断会影响多少镜头'],
      };
    case 'video':
      return {
        summary: '这是出片对象，适合判断当前素材链路是否完整，再决定是否直接渲染整片。',
        fields: [
          { label: '当前状态', value: status },
          { label: '预计时长', value: asText(data.duration, '未估算') },
          { label: '输出标题', value: asText(data.title, '视频输出') },
        ],
        suggestedActions: ['确认配音和镜头都已稳定', '分辨率和格式在下面决定', '如果上游还在 warning，先别急着出片'],
      };
    case 'decision':
      return {
        summary: '这是挂在画布上的待拍板对象，用来显式推动主线，而不是藏在聊天历史里。',
        fields: [
          { label: '当前状态', value: status },
          { label: '决策类型', value: asText(data.kind, '未分类') },
          { label: '影响范围', value: asText(data.badge, '主线推进') },
        ],
        suggestedActions: ['先让导演协作台解释为什么现在该决定', '确认后再直接执行下一步', '如果有疑虑，先比较受影响对象'],
      };
    case 'risk':
      return {
        summary: '这是挂在画布上的风险对象，用来把不确定性显性化，再决定要不要继续推进。',
        fields: [
          { label: '当前状态', value: status },
          { label: '风险类型', value: asText(data.kind, '未分类') },
          { label: '影响范围', value: asText(data.badge, '待确认') },
        ],
        suggestedActions: ['先判断风险是否真实成立', '确认风险后再选择刷新或继续', '风险消除前，不要直接推进下游动作'],
      };
    default:
      return {
        summary: '这是当前选中的画布对象。',
        fields: [{ label: '当前状态', value: status }],
        suggestedActions: ['先确认这个对象在主线里的作用'],
      };
  }
}

function renderEditor(node: CanvasNode, projectId: string, onClose: () => void) {
  const entity = resolveNodeEntity(node.id);
  switch (entity.kind) {
    case 'script-scene':
      return <ScriptSceneEditor sceneIndex={entity.sceneIndex} projectId={projectId} onDone={onClose} />;
    case 'shot':
      return <StoryboardCardEditor shotId={entity.shotId} projectId={projectId} />;
    case 'character':
      return <CharacterProfileEditor assetId={entity.assetId} projectId={projectId} />;
    case 'hub-ai':
      return <StoryboardHubEditor projectId={projectId} />;
    case 'hub-video':
      return <OutputVersionEditor projectId={projectId} />;
    case 'decision':
      return <WorkbenchPlaceholder text="这类对象主要用于拍板推进，请结合上方状态说明与协作动作继续处理。" />;
    case 'risk':
      return <WorkbenchPlaceholder text="这类对象主要用于评估风险与影响范围，请先处理风险，再决定是否继续推进。" />;
    default:
      return <WorkbenchPlaceholder text="这个对象暂时还没有直接操作能力。" />;
  }
}

function getMissingProjectText(node: CanvasNode) {
  const entity = resolveNodeEntity(node.id);
  switch (entity.kind) {
    case 'script-scene':
      return '当前还没有绑定项目，打开一个项目后，这里会直接进入剧本操作。';
    case 'shot':
      return '当前还没有绑定项目，打开一个项目后，这里会直接进入分镜操作。';
    case 'character':
      return '当前还没有绑定项目，打开一个项目后，这里会直接进入角色操作。';
    case 'hub-ai':
      return '当前还没有绑定项目，打开一个项目后，这里会直接进入整体生成操作。';
    case 'hub-video':
      return '当前还没有绑定项目，打开一个项目后，这里会直接进入出片操作。';
    case 'decision':
      return '这个对象主要用于拍板推进，先围绕它判断，再决定下一步动作。';
    case 'risk':
      return '这个对象主要用于风险评估，先明确影响，再决定是否继续推进。';
    default:
      return '这个对象暂时还没有直接操作能力。';
  }
}

export function getCanvasObjectTitle(node?: CanvasNode): string {
  if (!node) return '当前对象';
  const entity = resolveNodeEntity(node.id);
  switch (entity.kind) {
    case 'script-scene':
      return `剧本 · 场 ${entity.sceneIndex + 1}`;
    case 'shot':
      return '分镜';
    case 'character':
      return '角色';
    case 'hub-ai':
      return 'AI 核心 · 整体动作';
    case 'hub-video':
      return '视频输出 · 整体动作';
    case 'decision':
      return '待拍板事项';
    case 'risk':
      return '风险提示';
    default:
      return getNodeLabel(node);
  }
}

export function getCanvasObjectTitleFromNodeId(nodeId: string): string {
  const entity = resolveNodeEntity(nodeId);
  switch (entity.kind) {
    case 'script-scene':
      return `剧本 · 场 ${entity.sceneIndex + 1}`;
    case 'shot':
      return '分镜';
    case 'character':
      return '角色';
    case 'hub-ai':
      return 'AI 核心 · 整体动作';
    case 'hub-video':
      return '视频输出 · 整体动作';
    case 'decision':
      return '待拍板事项';
    case 'risk':
      return '风险提示';
    default:
      return '当前对象';
  }
}

export function CanvasObjectWorkbench({
  node,
  projectId,
  onClose,
}: {
  node: CanvasNode;
  projectId: string | null;
  onClose: () => void;
}) {
  if (!projectId) {
    return <WorkbenchPlaceholder text={getMissingProjectText(node)} />;
  }

  const overview = buildOverview(node);

  return (
    <div className="space-y-4">
      <WorkbenchSection title="当前对象">
        <p className="text-sm leading-6 text-muted-foreground">{overview.summary}</p>
        <div className="mt-3 space-y-2">
          {overview.fields.map((field) => (
            <div key={field.label} className="rounded-xl border border-border bg-background/60 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{field.label}</div>
              <div className="mt-1 text-sm text-foreground">{field.value}</div>
            </div>
          ))}
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="下一步">
        <div className="space-y-2">
          {overview.suggestedActions.map((item) => (
            <div key={item} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="直接操作">
        {renderEditor(node, projectId, onClose)}
      </WorkbenchSection>
    </div>
  );
}
