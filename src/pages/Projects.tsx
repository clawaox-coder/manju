import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, LayoutGrid, List, SlidersHorizontal, ArrowDownAZ, ArrowDownUp, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ProjectCard } from '@/components/domain/ProjectCard';
import { useProjects, useDeleteProject, useDuplicateProject } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'rendering', label: '渲染中' },
  { key: 'done', label: '已完成' },
  { key: 'draft', label: '草稿' }
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];
type SortKey = 'updated' | 'name' | 'progress';

export default function Projects() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [genre, setGenre] = useState('全部');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [query, setQuery] = useState('');

  const apiParams = {
    ...(status !== 'all' ? { status: status as 'draft' | 'rendering' | 'done' } : {}),
    ...(query.trim() ? { q: query.trim() } : {}),
  };
  const { data, isLoading } = useProjects(apiParams);
  const projects = data?.data ?? [];

  const deleteMut = useDeleteProject();
  const dupMut = useDuplicateProject();

  const genres = useMemo(() => ['全部', ...new Set(projects.map((p) => p.genre).filter(Boolean))], [projects]);

  const filtered = useMemo(() => {
    let list = projects;
    if (genre !== '全部') list = list.filter((p) => p.genre === genre);
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'progress') list = [...list].sort((a, b) => b.progress - a.progress);
    return list;
  }, [projects, genre, sortBy]);

  function handleAction(p: Project, action: 'open' | 'rename' | 'duplicate' | 'delete' | 'export') {
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
          deleteMut.mutate(p.id, { onSuccess: () => toast.info('已移入回收站') });
        }
      });
    }
  }

  const statusBadge = (s: Project['status']) =>
    s === 'rendering' ? <Badge variant="warning">渲染中</Badge> : s === 'done' ? <Badge variant="success">已完成</Badge> : s === 'archived' ? <Badge variant="gray">已归档</Badge> : <Badge variant="gray">草稿</Badge>;

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">项目管理</h1>
          <p className="text-xs text-muted-foreground mt-1">
            共 <span>{projects.length}</span> 个项目 · 筛选后 <span>{filtered.length}</span> 个
          </p>
        </div>
        <Button onClick={() => navigate('/script')}>+ 新建项目</Button>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索项目名..."
            className="pl-9 w-56 h-9"
          />
        </div>

        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs transition',
                status === s.key ? 'gradient-purple text-white' : 'hover:bg-accent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="w-3.5 h-3.5" /> 题材: {genre}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={genre} onValueChange={setGenre}>
              {genres.map((g) => (
                <DropdownMenuRadioItem key={g} value={g!}>
                  {g}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {sortBy === 'name' ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <ArrowDownUp className="w-3.5 h-3.5" />} 排序
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>按字段排序</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <DropdownMenuRadioItem value="updated">更新时间</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">名称</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="progress">进度</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1 border border-border rounded-lg p-0.5">
          <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setView('grid')}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setView('list')}>
            <List className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="py-20 text-center text-muted-foreground">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-sm">没有匹配的项目</div>
        </Card>
      ) : view === 'grid' ? (
        <motion.div layout className="grid grid-cols-4 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => handleAction(p, 'open')} onAction={(a) => handleAction(p, a)} />
          ))}
        </motion.div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">项目</th>
                <th className="px-5 py-3 text-left font-medium">题材</th>
                <th className="px-5 py-3 text-left font-medium">状态</th>
                <th className="px-5 py-3 text-left font-medium">版本</th>
                <th className="px-5 py-3 text-left font-medium">进度</th>
                <th className="px-5 py-3 text-left font-medium">更新时间</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border/50 hover:bg-accent/50 cursor-pointer" onClick={() => handleAction(p, 'open')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-lg flex-shrink-0', p.bgStyle || 'bg-muted')} />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{p.genre || '-'}</td>
                  <td className="px-5 py-3">{statusBadge(p.status)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{p.version}</td>
                  <td className="px-5 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                        <div className="h-full gradient-purple" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span>{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => handleAction(p, 'open')}>
                      打开
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
