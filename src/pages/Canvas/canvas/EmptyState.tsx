interface EmptyStateProps {
  projectName: string;
}

export function EmptyState({ projectName }: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl mb-4">🎬</div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5">创作画布</div>
      <h1 className="text-xl font-semibold text-foreground/75 mb-2 max-w-[360px] truncate px-6 text-center">
        {projectName || '新项目'}
      </h1>
      <p className="text-sm text-muted-foreground">在右侧对话开始创作 ✨</p>
    </div>
  );
}
