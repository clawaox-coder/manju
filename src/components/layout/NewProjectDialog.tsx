import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCreateProject } from '@/hooks/useProjectApi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const GENRES = ['言情', '都市', '古风', '玄幻', '搞笑', '悬疑', '校园', '励志'];
const MODES = [
  { key: 'script', label: '从剧本', desc: '上传或粘贴文本', icon: '📝' },
  { key: 'idea', label: '从灵感', desc: '描述故事大纲', icon: '💡' },
  { key: 'template', label: '从模板', desc: '选择预设模板', icon: '🎨' }
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('言情');
  const [mode, setMode] = useState('script');
  const createMut = useCreateProject();
  const navigate = useNavigate();

  function handleCreate() {
    const projectName = name.trim() || `未命名项目-${Date.now().toString().slice(-5)}`;
    createMut.mutate(
      { name: projectName, genre, from: mode as 'script' | 'idea' | 'template' },
      {
        onSuccess: () => {
          toast.success(`已创建「${projectName}」`);
          setName('');
          onClose();
          navigate(mode === 'script' ? '/script' : mode === 'template' ? '/storyboard' : '/script');
        },
        onError: () => {
          toast.error('创建失败, 请重试');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>选择创建方式, 然后让 AI 帮你完成剩下的工作</DialogDescription>
        </DialogHeader>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">项目名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="给你的作品起个名字..." />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">题材</label>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs transition',
                  genre === g ? 'gradient-purple text-white' : 'bg-muted hover:bg-accent'
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">创作方式</label>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  'p-3 rounded-xl border-2 text-left transition',
                  mode === m.key ? 'border-brand-500 bg-brand-50/30' : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <div className="text-2xl mb-1">{m.icon}</div>
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-[11px] text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleCreate}>创建并开始</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
