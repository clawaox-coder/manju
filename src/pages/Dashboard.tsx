import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Sparkles,
  Upload,
  LayoutGrid,
  Clock,
  Coins,
  Users as UsersIcon,
  TrendingUp,
  ChevronRight,
  Wand2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store';
import { ProjectCard } from '@/components/domain/ProjectCard';
import { useProjects, useDeleteProject, useDuplicateProject } from '@/hooks/useProjectApi';
import { useTeamMembers } from '@/hooks/useAuthApi';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

const TEMPLATE_SUGGESTIONS = [
  { name: '都市言情·15 集模板', uses: '2.4w', icon: '💖', bg: 'from-pink-300 to-purple-400' },
  { name: '古风修仙·快节奏', uses: '1.8w', icon: '⚔️', bg: 'from-blue-400 to-indigo-500' },
  { name: '校园日常·治愈系', uses: '9.5k', icon: '🎒', bg: 'from-yellow-300 to-orange-400' },
  { name: '悬疑探案·烧脑向', uses: '6.2k', icon: '🔍', bg: 'from-gray-700 to-purple-700' }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: teamMembers = [] } = useTeamMembers();
  const { data } = useProjects({ pageSize: 5 });
  const projects = data?.data ?? [];
  const deleteMut = useDeleteProject();
  const dupMut = useDuplicateProject();

  const stats: { label: string; value: string; delta: string; color: string; icon: typeof LayoutGrid; onClick?: () => void }[] = [
    { label: '本月作品', value: projects.length.toString(), delta: '', color: 'brand', icon: LayoutGrid },
    { label: '渲染时长', value: '—', delta: '', color: 'green', icon: Clock },
    { label: '积分余额', value: '—', delta: '', color: 'purple', icon: Coins, onClick: () => navigate('/billing') },
    { label: '团队成员', value: `${teamMembers.length}`, delta: '', color: 'gray', icon: UsersIcon, onClick: () => navigate('/team') }
  ];

  function handleProjectAction(p: Project, action: 'open' | 'rename' | 'duplicate' | 'delete' | 'export') {
    if (action === 'open') {
      setProjectId(p.id);
      setProjectName(p.name);
      navigate('/script');
    }
    else if (action === 'rename') toast.info(`重命名「${p.name}」`);
    else if (action === 'duplicate') {
      dupMut.mutate(p.id, { onSuccess: () => toast.success(`已复制「${p.name}」`) });
    } else if (action === 'export') toast.success(`「${p.name}」已加入导出队列`);
    else if (action === 'delete') {
      confirm({
        title: '删除项目',
        message: `确定删除「${p.name}」? 可在回收站中恢复。`,
        okText: '删除',
        danger: true,
        onConfirm: () => {
          deleteMut.mutate(p.id, { onSuccess: () => toast.info(`「${p.name}」已移入回收站`) });
        }
      });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 relative overflow-hidden scene-bg-hero text-white"
      >
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 -mr-32 -mt-32" />
        <div className="absolute bottom-0 right-20 w-40 h-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs opacity-90 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 创作助手</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">下午好, 星辰工作室 👋</h1>
          <p className="text-sm opacity-90 max-w-xl mb-5">
            今天有 3 个项目等待你的创作灵感, 让 AI 帮你把脑海中的故事变成短剧。
          </p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/script')} className="bg-white/20 backdrop-blur hover:bg-white/30 shadow-none">
              <Upload className="w-4 h-4" /> 上传剧本
            </Button>
            <Button onClick={() => navigate('/storyboard')} className="bg-white/20 backdrop-blur hover:bg-white/30 shadow-none">
              <LayoutGrid className="w-4 h-4" /> 浏览模板
            </Button>
            <Button onClick={() => toast.info('AI 灵感生成器已打开')} className="bg-white text-brand-700 hover:bg-white/90 shadow-none">
              <Wand2 className="w-4 h-4" /> AI 生成灵感
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className={cn('p-4 cursor-pointer hover:shadow-md transition', s.onClick && 'hover:border-brand-300')}
                onClick={s.onClick}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', `bg-${s.color}-50 text-${s.color}-600`)}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <TrendingUp className="w-3 h-3" />
                  {s.delta}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">最近项目</h2>
          <button onClick={() => navigate('/projects')} className="text-xs text-brand-600 hover:underline flex items-center">
            全部 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/video?project=${p.id}`)} onAction={(a) => handleProjectAction(p, a)} compact />
          ))}
        </div>
      </div>

      {/* Template suggestions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">推荐模板</h2>
          <button onClick={() => navigate('/storyboard')} className="text-xs text-brand-600 hover:underline flex items-center">
            更多模板 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {TEMPLATE_SUGGESTIONS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <Card
                className="overflow-hidden cursor-pointer hover:shadow-lg transition group"
                onClick={() => {
                  toast.success(`已应用「${t.name}」`);
                  navigate('/video');
                }}
              >
                <div className={cn('aspect-video bg-gradient-to-br flex items-center justify-center text-5xl', t.bg)}>
                  {t.icon}
                </div>
                <div className="p-3">
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">已被 {t.uses} 用户使用</div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <Card className="p-5 gradient-purple-soft border-purple-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-purple flex items-center justify-center shadow-purple">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-semibold mb-0.5">还没有项目?</div>
            <div className="text-xs text-muted-foreground">10 分钟做出你的第一部 AI 短剧, 现在开始</div>
          </div>
          <Button onClick={() => navigate('/help')}>查看教程</Button>
        </div>
      </Card>
    </div>
  );
}
