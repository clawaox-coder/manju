interface EmptyStateProps {
  projectName: string;
}

export function EmptyState({ projectName }: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
      <h1 className="text-3xl font-bold text-foreground/80 mb-3">{projectName || '新项目'}</h1>
      <p className="text-sm text-muted-foreground">在右侧对话开始创作</p>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent" />
    </div>
  );
}
