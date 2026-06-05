import { AlertTriangle, CheckCircle2, Layers3, Sparkles, X } from 'lucide-react';
import type { CanvasNode } from './buildGraph';
import type { Stage } from './agent/types';
import { getNodeFocusTypeLabel, getNodeLabel, getNodeStageTask, getNodeStatus, type CanvasContextSummary } from './focusContext';
import { CanvasObjectWorkbench, getCanvasObjectTitle } from './CanvasObjectWorkbench';

interface CanvasInspectorRailProps {
  selectedNodeId: string | null;
  projectId: string | null;
  node?: CanvasNode;
  summary: CanvasContextSummary;
  stage: Stage;
  onClearSelection: () => void;
  onRequestNodeConversation: (node: CanvasNode) => void;
  onRunCoordinationAction: (node: CanvasNode) => void;
}

function statusTone(status: string) {
  switch (status) {
    case 'locked':
    case 'ready':
      return 'border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'warning':
      return 'border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
    case 'stale':
      return 'border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300';
    case 'generating':
      return 'border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300';
    default:
      return 'border-border bg-background text-muted-foreground';
  }
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-brand/15 bg-brand/10 text-brand">
          <Layers3 className="h-5 w-5" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">当前对象</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          选中画布里的对象后，这里会显示它的上下文、可执行动作和直接操作入口。
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-brand" />
          导演协作提示
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          先在中间画布点一个对象，协作和操作就都会围绕它继续展开。
        </p>
      </div>
    </div>
  );
}

export function CanvasInspectorRail({
  selectedNodeId,
  projectId,
  node,
  summary,
  stage,
  onClearSelection,
  onRequestNodeConversation,
  onRunCoordinationAction,
}: CanvasInspectorRailProps) {
  const title = selectedNodeId ? getCanvasObjectTitle(node) : '当前对象';
  const subtitle = node?.data?.title ?? node?.data?.name ?? null;
  const focusTypeLabel = getNodeFocusTypeLabel(node);
  const focusTask = getNodeStageTask(node, stage);
  const focusStatus = getNodeStatus(node);
  const pendingDecisions = summary.pending_decisions.slice(0, 2);
  const riskFlags = summary.risk_flags.slice(0, 2);
  const isCoordinationNode = node?.type === 'decision' || node?.type === 'risk';
  const targetIds = Array.isArray(node?.data?.targetIds) ? node.data.targetIds as string[] : [];
  const ctaLabel = node?.type === 'decision'
    ? '帮我拍板这个决定'
    : node?.type === 'risk'
      ? '帮我评估这个风险'
      : null;
  const actionLabel = node?.data?.kind === 'generate_script'
    ? '开始生成剧本'
    : node?.data?.kind === 'generate_storyboard' || node?.data?.kind === 'refresh_storyboard' || node?.data?.kind === 'stale_dependency'
      ? '刷新分镜'
      : node?.data?.kind === 'match_voice' || node?.data?.kind === 'missing_voice'
        ? '进入配音'
        : node?.data?.kind === 'render_video'
          ? '开始渲染'
          : null;

  return (
    <aside className="h-full w-full shrink-0 overflow-hidden rounded-[28px] border border-border/80 bg-background/88 backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="border-b border-border/80 bg-card/55 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                当前对象
              </div>
              <h2 className="mt-1 truncate text-sm font-semibold text-foreground">{title}</h2>
              {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {selectedNodeId && (
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="清除当前焦点"
                title="清除当前焦点"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-background/15 to-card/25 px-4 py-4">
          {selectedNodeId ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {focusTypeLabel && (
                    <span className="rounded-full border border-brand/15 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand">
                      {focusTypeLabel}
                    </span>
                  )}
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone(focusStatus)}`}>
                    {focusStatus}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{getNodeLabel(node)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {focusTask}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <SummaryMetric label="剧本场次" value={summary.stage_summary.scene_count} />
                <SummaryMetric label="分镜数量" value={summary.stage_summary.shot_count} />
                <SummaryMetric label="角色数量" value={summary.stage_summary.character_count} />
                <SummaryMetric label="当前阶段" value={summary.project_stage} />
              </section>

              {(pendingDecisions.length > 0 || riskFlags.length > 0) && (
                <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                  {pendingDecisions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-brand" />
                        当前待拍板
                      </div>
                      <div className="mt-2 space-y-2">
                        {pendingDecisions.map((item) => (
                          <div key={item.id} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                            {item.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {riskFlags.length > 0 && (
                    <div className={pendingDecisions.length > 0 ? 'mt-4' : ''}>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        当前风险
                      </div>
                      <div className="mt-2 space-y-2">
                        {riskFlags.map((item) => (
                          <div key={item.id} className="rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            {item.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                <div className="mb-3 text-sm font-medium text-foreground">直接操作</div>
                {isCoordinationNode && node ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-muted-foreground">
                      这不是素材对象，而是挂在画布上的协作事项。你可以围绕它继续判断，再决定要不要推进后续动作。
                    </p>
                    {targetIds.length > 0 && (
                      <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                        影响对象：{targetIds.length} 个
                      </div>
                    )}
                    {ctaLabel && (
                      <button
                        type="button"
                        onClick={() => onRequestNodeConversation(node)}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition hover:opacity-90"
                      >
                        {ctaLabel}
                      </button>
                    )}
                    {actionLabel && (
                      <button
                        type="button"
                        onClick={() => onRunCoordinationAction(node)}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
                      >
                        {actionLabel}
                      </button>
                    )}
                  </div>
                ) : (
                  node ? <CanvasObjectWorkbench node={node} projectId={projectId} onClose={onClearSelection} /> : null
                )}
              </section>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </aside>
  );
}
