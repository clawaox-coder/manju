import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, Sparkles, ArrowUp, Plus, Flame, FileText, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ProjectCard } from '@/components/domain/ProjectCard';
import { CommunityCard, type CommunityWork } from '@/components/domain/CommunityCard';
import { HighlightCard, type Highlight } from '@/components/domain/HighlightCard';
import { TechBackground } from '@/components/TechBackground';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { useProjects, useCreateProject, useDeleteProject, useDuplicateProject } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

// 创作模式胶囊（参考 OiiOii 输入框下的模式切换）。
const MODES = ['剧情故事短片', '自由画布', '角色设计', '分镜生成'] as const;

// 「亮点」功能卡：漫剧AI 的创作入口。封面暂用渐变占位，待接入真实模板缩略图后替换。
const HIGHLIGHTS: Highlight[] = [
  { id: 'h-story', title: '剧情故事短片', cover: 'linear-gradient(135deg,#1e1b4b,#6d28d9 60%,#0f172a)', tag: '多模型' },
  { id: 'h-canvas', title: '自由画布', cover: 'linear-gradient(135deg,#0e7490,#7c3aed 70%,#0f172a)', tag: '多模型' },
  { id: 'h-scene', title: '场景设计', cover: 'linear-gradient(135deg,#334155,#0f172a)' },
  { id: 'h-character', title: '角色设定', cover: 'linear-gradient(135deg,#7c3aed,#db2777)' },
  { id: 'h-derivative', title: '衍生品设计', cover: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' },
];

// 社区作品占位数据：后端暂无「公开作品」接口，先用本地数据呈现版块视觉。
const COMMUNITY_WORKS: CommunityWork[] = [
  { id: 'c-1', title: '万古剑帝：从混沌开始', cover: 'linear-gradient(135deg,#6d28d9,#2563eb)', authorName: '青衫旧梦', authorAvatar: '青', likes: 24000 },
  { id: 'c-2', title: '反派师尊的心尖宠', cover: 'linear-gradient(135deg,#db2777,#7c3aed)', authorName: '墨白', authorAvatar: '墨', likes: 18000 },
  { id: 'c-3', title: '赛博墨士：拳脚写代码', cover: 'linear-gradient(135deg,#0891b2,#1e3a8a)', authorName: '桃夭夭', authorAvatar: '桃', likes: 15600 },
  { id: 'c-4', title: '都市修仙：写字楼渡劫', cover: 'linear-gradient(135deg,#7c3aed,#2563eb)', authorName: '代码诗人', authorAvatar: '码', likes: 9800 },
  { id: 'c-5', title: '狐妖少女的现代生活', cover: 'linear-gradient(135deg,#e11d48,#9333ea)', authorName: '酒中仙', authorAvatar: '酒', likes: 32000 },
  { id: 'c-6', title: '星海歌姬的最终舞台', cover: 'linear-gradient(135deg,#0ea5e9,#6366f1)', authorName: '夜行歌', authorAvatar: '夜', likes: 12300 },
];

export default function Showcase() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const [query, setQuery] = useState('');
  const [idea, setIdea] = useState('');
  const [mode, setMode] = useState<string>(MODES[0]);

  const { data, isLoading } = useProjects(query.trim() ? { q: query.trim() } : {});
  const filtered = data?.data ?? [];
  const createMut = useCreateProject();
  const deleteMut = useDeleteProject();
  const dupMut = useDuplicateProject();

  // 打开作品 = 把它载入画布工作区。
  function openProject(p: Project) {
    setProjectId(p.id);
    setProjectName(p.name);
    navigate('/canvas');
  }

  // 想法框 / 亮点卡：开一个全新画布(= 新项目)，把想法文本通过路由 state 带进画布对话。
  function startFromIdea(seed?: string) {
    const text = (seed ?? idea).trim();
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

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[#09090b] text-foreground">
      <TechBackground />

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-[#09090b]/70 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-[#09090b] shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">漫剧AI</span>
        </div>
        <AccountMenu />
      </header>

      {/* 输入框区（居中） */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 pt-16 pb-8">
        <h1 className="mb-1.5 text-center text-2xl font-semibold tracking-tight">今天想创作点什么?</h1>
        <p className="mb-6 text-center text-sm text-white/45">
          说一句你的想法，AI 会为你新建一个画布工作空间，从这里展开整部作品。
        </p>
        <div className="relative rounded-2xl border border-white/12 bg-white/[0.04] backdrop-blur-md transition-colors focus-within:border-white/30 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); startFromIdea(); }
            }}
            rows={3}
            placeholder="例如：一个都市修仙的故事，主角在写字楼里渡劫…"
            className="w-full resize-none bg-transparent px-4 pt-4 pb-12 text-sm text-foreground outline-none placeholder:text-white/35"
          />
          {/* 左下功能图标（装饰为主，呼应 OiiOii 输入框工具条） */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 text-white/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5"><Plus className="h-3.5 w-3.5" /></span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5"><FileText className="h-3.5 w-3.5" /></span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5"><ImageIcon className="h-3.5 w-3.5" /></span>
          </div>
          <button
            type="button"
            onClick={() => startFromIdea()}
            disabled={createMut.isPending}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#09090b] shadow-[0_2px_12px_rgba(0,0,0,0.5)] transition hover:bg-white/90 disabled:opacity-40"
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        {/* 模式胶囊 */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition',
                mode === m
                  ? 'bg-white text-[#09090b] shadow-[0_2px_12px_rgba(0,0,0,0.4)]'
                  : 'border border-white/12 bg-white/[0.04] text-white/55 hover:bg-white/10 hover:text-white',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* 我的作品 */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">我的作品</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索作品..."
              className="h-8 w-52 rounded-lg border-white/10 bg-white/5 pl-8 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : filtered.length === 0 ? (
          <button
            type="button"
            onClick={() => startFromIdea()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-white/12 py-14 text-white/45 transition-colors hover:border-white/30 hover:text-white"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm">还没有作品，从上面说个想法开始吧</span>
          </button>
        ) : (
          <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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

      {/* 亮点（功能卡） */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-12">
        <h2 className="mb-4 flex items-center gap-1.5 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-white/70" />
          亮点
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.slice(0, 2).map((h) => (
            <HighlightCard key={h.id} highlight={h} onClick={() => startFromIdea(h.title)} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.slice(2).map((h) => (
            <HighlightCard key={h.id} highlight={h} onClick={() => startFromIdea(h.title)} />
          ))}
        </div>
      </div>

      {/* 社区作品 */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Flame className="h-4 w-4 text-[#fb923c]" />
            社区作品
          </h2>
          <button
            type="button"
            onClick={() => toast.info('社区频道即将开放')}
            className="text-xs text-white/45 transition-colors hover:text-white"
          >
            查看更多
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {COMMUNITY_WORKS.map((work) => (
            <CommunityCard key={work.id} work={work} />
          ))}
        </div>
      </div>
    </div>
  );
}
