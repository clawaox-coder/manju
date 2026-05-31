import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, Sparkles, ArrowUp, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ProjectCard } from '@/components/domain/ProjectCard';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { useProjects, useCreateProject, useDeleteProject, useDuplicateProject } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { useStore } from '@/store';
import type { Project } from '@/types';

export default function Showcase() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const [query, setQuery] = useState('');
  const [idea, setIdea] = useState('');

  const { data, isLoading } = useProjects(query.trim() ? { q: query.trim() } : {});
  const filtered = data?.data ?? [];
  const createMut = useCreateProject();
  const deleteMut = useDeleteProject();
  const dupMut = useDuplicateProject();

  // Open a project = load it into the canvas workspace.
  function openProject(p: Project) {
    setProjectId(p.id);
    setProjectName(p.name);
    navigate('/canvas');
  }

  // The idea box: spin up a fresh canvas (= a new project/workspace) and
  // carry the idea text into the canvas conversation via navigation state.
  function startFromIdea() {
    const text = idea.trim();
    const name = text ? text.slice(0, 20) : `新作品-${Math.round(performance.now())}`;
    createMut.mutate(
      { name, from: 'idea' },
      {
        onSuccess: (proj) => {
          setProjectId(proj.id);
          setProjectName(proj.name);
          setIdea('');
          navigate('/canvas', { state: { idea: text } });
        },
        onError: () => toast.error('创建失败, 请重试'),
      },
    );
  }

  // PLACEHOLDER_RENDER
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-[linear-gradient(135deg,#111827,#2563eb)] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">漫剧AI</span>
        </div>
        <AccountMenu />
      </header>

      <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
        <h1 className="text-2xl font-semibold text-center mb-1.5">今天想创作点什么?</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          说一句你的想法，AI 会为你新建一个画布工作空间，从这里展开整部作品。
        </p>
        <div className="relative max-w-2xl mx-auto">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); startFromIdea(); }
            }}
            rows={3}
            placeholder="例如：一个都市修仙的故事，主角在写字楼里渡劫…"
            className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3.5 pr-14 text-sm outline-none focus:border-primary/40 transition-colors"
          />
          <button
            type="button"
            onClick={startFromIdea}
            disabled={createMut.isPending}
            className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition"
          >
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {/* PLACEHOLDER_GALLERY */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">我的作品</h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索作品..."
              className="pl-8 w-52 h-8 text-xs rounded-lg"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <button
            type="button"
            onClick={startFromIdea}
            className="w-full rounded-2xl border border-dashed border-border py-16 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <Plus className="w-6 h-6" />
            <span className="text-sm">还没有作品，从上面说个想法开始吧</span>
          </button>
        ) : (
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => openProject(p)}
                onAction={(a) => {
                  if (a === 'open') openProject(p);
                  else if (a === 'duplicate') dupMut.mutate(p.id, { onSuccess: () => toast.success(`已复制「${p.name}」`) });
                  else if (a === 'export') toast.success(`「${p.name}」已加入导出队列`);
                  else if (a === 'rename') toast.info(`重命名「${p.name}」`);
                  else if (a === 'delete') {
                    confirm({
                      title: '删除作品',
                      message: `确定删除「${p.name}」?`,
                      okText: '删除',
                      danger: true,
                      onConfirm: () => deleteMut.mutate(p.id, { onSuccess: () => toast.info('已删除') }),
                    });
                  }
                }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
