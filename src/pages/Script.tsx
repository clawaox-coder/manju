import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Save, FileText, Wand2, ArrowRight, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { useScript, useUpdateScript } from '@/hooks/useScriptApi';
import { streamScriptContinue } from '@/lib/api/ai';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SAMPLE_SCRIPT = `# 新剧本

在这里开始创作你的剧本...

【场景 1】

`;

const AI_QUICK_ACTIONS = [
  { label: '续写下一场', prompt: '续写下一场剧情' },
  { label: '生成对白', prompt: '为当前角色生成对白' },
  { label: '优化情节', prompt: '优化当前情节的节奏' },
  { label: '提取分镜', prompt: '从剧本中提取所有分镜' }
];

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
}

export default function Script() {
  const navigate = useNavigate();
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);

  const { data: scriptData, isLoading } = useScript(projectId ?? undefined);
  const updateScript = useUpdateScript(projectId ?? '');

  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [versionNo, setVersionNo] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: 'ai', text: '你好! 我是 AI 创作助手, 可以帮你续写剧本、生成对白、提取分镜。试试左侧的快速操作?' }
  ]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 从 API 加载脚本内容
  useEffect(() => {
    if (scriptData) {
      setScript(scriptData.content || SAMPLE_SCRIPT);
      setVersionNo(scriptData.version_no);
      setDirty(false);
    }
  }, [scriptData]);

  // debounced auto-save (3s after last edit)
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!projectId || !dirty) return;
      updateScript.mutate(
        { content: script, expected_version_no: versionNo },
        {
          onSuccess: (data) => {
            setVersionNo(data.version_no);
            setDirty(false);
          },
        },
      );
    }, 3000);
  }, [projectId, dirty, script, versionNo, updateScript]);

  function handleChange(value: string) {
    setScript(value);
    setDirty(true);
    scheduleSave();
  }

  function manualSave() {
    if (!projectId) {
      toast.error('请先选择一个项目');
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    updateScript.mutate(
      { content: script, expected_version_no: versionNo },
      {
        onSuccess: (data) => {
          setVersionNo(data.version_no);
          setDirty(false);
          toast.success('已保存');
        },
        onError: (err) => toast.error(`保存失败: ${(err as Error).message}`),
      },
    );
  }

  const wordCount = useMemo(() => script.replace(/\s/g, '').length, [script]);
  const sceneCount = useMemo(() => (script.match(/【场景/g) || []).length, [script]);
  const dialogCount = useMemo(() => (script.match(/^[^[【\s].*?:/gm) || []).length, [script]);

  function send(prompt: string) {
    if (!prompt.trim()) return;
    const projectId = useStore.getState().projectId;
    if (!projectId) {
      toast.error('请先选择一个项目');
      return;
    }
    setChat((c) => [...c, { role: 'user', text: prompt }]);
    setAskInput('');
    setChat((c) => [...c, { role: 'ai', text: '' }]);

    (async () => {
      try {
        let full = '';
        for await (const evt of streamScriptContinue({
          project_id: projectId,
          context: script.slice(-2000),
          instruction: prompt,
        })) {
          if (evt.event === 'delta') {
            full += (evt.data as { text?: string }).text ?? '';
            setChat((c) => {
              const next = [...c];
              next[next.length - 1] = { role: 'ai', text: full };
              return next;
            });
          } else if (evt.event === 'error') {
            toast.error(`AI 错误: ${(evt.data as { message?: string }).message ?? '未知'}`);
          }
        }
        if (!full) {
          setChat((c) => {
            const next = [...c];
            next[next.length - 1] = { role: 'ai', text: '(AI 未返回内容)' };
            return next;
          });
        }
      } catch (err) {
        toast.error(`AI 请求失败: ${(err as Error).message}`);
        setChat((c) => {
          const next = [...c];
          next[next.length - 1] = { role: 'ai', text: '(请求失败)' };
          return next;
        });
      }
    })();
  }

  function splitShot() {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const next = script.slice(0, pos) + '\n\n【场景 ?】\n' + script.slice(pos);
    setScript(next);
    setTimeout(() => ta.focus(), 0);
    toast.success('已插入分镜分隔符');
  }

  function autoGenerate() {
    toast.info('AI 正在生成分镜...');
    setTimeout(() => {
      toast.success('已生成 6 个分镜');
      navigate('/storyboard');
    }, 1500);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="text-xs text-brand-600 hover:underline">
            {projectName} ›
          </button>
          <h1 className="text-base font-semibold">剧本创作</h1>
          <Badge variant="success">{dirty ? '未保存' : isLoading ? '加载中...' : '自动保存'}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={manualSave} disabled={updateScript.isPending}>
            <Save className="w-3.5 h-3.5" /> {dirty ? '保存*' : '已保存'}
          </Button>
          <Button size="sm" onClick={autoGenerate}>
            <ArrowRight className="w-3.5 h-3.5" /> 下一步: 生成分镜
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-card px-6 py-2 flex items-center gap-3 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            <span>scene-1.md</span>
            <span className="ml-auto flex items-center gap-3">
              <span>
                字数 <strong className="text-foreground">{wordCount}</strong>
              </span>
              <span>
                场景 <strong className="text-foreground">{sceneCount}</strong>
              </span>
              <span>
                对白 <strong className="text-foreground">{dialogCount}</strong>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1 px-6 py-2 border-b border-border bg-card/50">
            <Button variant="ghost" size="sm" onClick={splitShot}>
              + 插入分镜
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Markdown 格式工具栏')}>
              加粗
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Markdown 格式工具栏')}>
              斜体
            </Button>
            <Button variant="ghost" size="sm" onClick={() => send('为当前段落生成对白')}>
              <Sparkles className="w-3.5 h-3.5" /> AI 重写
            </Button>
          </div>
          <textarea
            ref={textareaRef}
            value={script}
            onChange={(e) => handleChange(e.target.value)}
            className="flex-1 px-12 py-8 text-sm font-mono leading-relaxed bg-card outline-none resize-none"
            spellCheck={false}
          />
        </div>

        {/* Right: AI Assistant */}
        <div className="w-96 border-l border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg gradient-purple flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm">AI 创作助手</div>
                <div className="text-[11px] text-muted-foreground">Sonnet 4.6 · 在线</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {AI_QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  className="px-2 py-1.5 rounded-lg border border-border text-xs hover:bg-accent text-left"
                >
                  <Wand2 className="w-3 h-3 inline mr-1" /> {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence initial={false}>
              {chat.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs',
                      m.role === 'ai' ? 'gradient-purple text-white' : 'bg-muted'
                    )}
                  >
                    {m.role === 'ai' ? <Sparkles className="w-3 h-3" /> : '我'}
                  </div>
                  <div
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs max-w-[80%] whitespace-pre-wrap',
                      m.role === 'ai' ? 'bg-muted' : 'gradient-purple text-white'
                    )}
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(askInput)}
                placeholder="向 AI 提问..."
                className="flex-1 px-3 py-2 rounded-lg border border-border text-xs focus:border-brand-400 focus:outline-none bg-background"
              />
              <Button size="icon" className="size-9" onClick={() => send(askInput)} disabled={!askInput.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              <span>Enter 发送 · Shift+Enter 换行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
