import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Consistency() {
  const projectName = useStore((s) => s.projectName);
  const initial = useStore((s) => s.consistency);
  const [list, setList] = useState(initial);
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  const avg = Math.round(list.reduce((s, c) => s + c.score, 0) / list.length);
  const totalIssues = list.reduce((s, c) => s + c.issues, 0);

  function recheck() {
    setChecking(true);
    toast.info('AI 正在检测角色一致性...');
    setTimeout(() => {
      setList((cur) => cur.map((c) => ({ ...c, score: Math.min(100, c.score + Math.floor(Math.random() * 5)) })));
      setChecking(false);
      toast.success('一致性检测完成');
    }, 1500);
  }

  function fixCharacter(idx: number) {
    const c = list[idx];
    toast.info(`AI 正在修复 ${c.name} 的一致性问题...`);
    setTimeout(() => {
      setList((cur) =>
        cur.map((x, i) =>
          i === idx ? { ...x, score: Math.min(100, x.score + 8 + Math.floor(Math.random() * 5)), issues: 0, issueDetails: undefined } : x
        )
      );
      toast.success(`${c.name} 的问题已全部修复`);
    }, 1500);
  }

  function fixSingle(ci: number, di: number) {
    setList((cur) =>
      cur.map((x, i) => {
        if (i !== ci) return x;
        const details = (x.issueDetails || []).filter((_, k) => k !== di);
        return { ...x, issueDetails: details.length ? details : undefined, issues: details.length, score: Math.min(100, x.score + 5) };
      })
    );
    toast.success('问题已修复');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <button onClick={() => navigate('/video')} className="text-xs text-brand-600 hover:underline">
            {projectName} ›
          </button>
          <h1 className="text-xl font-bold mt-1">角色一致性检查</h1>
          <p className="text-xs text-muted-foreground mt-1">分析角色形象、服装、特征在不同镜头中的一致性</p>
        </div>
        <Button onClick={recheck} disabled={checking}>
          <Sparkles className={cn('w-3.5 h-3.5', checking && 'animate-pulse')} /> 重新检测
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-2">综合一致性评分</div>
          <div className="flex items-end gap-2">
            <div className={cn('text-4xl font-bold', avg >= 90 ? 'text-green-600' : avg >= 70 ? 'text-yellow-600' : 'text-red-500')}>{avg}</div>
            <div className="text-lg text-muted-foreground pb-1">/ 100</div>
            <Badge variant={avg >= 90 ? 'success' : avg >= 70 ? 'warning' : 'destructive'} className="ml-2 mb-1">
              {avg >= 90 ? '优秀' : avg >= 70 ? '良好' : '需改进'}
            </Badge>
          </div>
          <Progress value={avg} indicatorClassName={cn(avg >= 90 ? 'bg-green-500' : avg >= 70 ? 'bg-yellow-500' : 'bg-red-500', '!bg-none')} className="mt-3" />
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-2">检测到的问题</div>
          <div className={cn('text-4xl font-bold', totalIssues === 0 ? 'text-green-600' : 'text-yellow-600')}>{totalIssues}</div>
          <div className="text-xs text-muted-foreground mt-3">{totalIssues === 0 ? '✓ 全部通过' : `涉及 ${list.filter((c) => c.issues > 0).length} 个角色`}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-2">参与角色</div>
          <div className="text-4xl font-bold">{list.length}</div>
          <div className="flex -space-x-2 mt-3">
            {list.map((c) => (
              <div key={c.name} className={cn('w-7 h-7 rounded-full border-2 border-card flex items-center justify-center text-sm', c.bg)} title={c.name}>
                {c.avatar}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold">角色一致性详情</h3>
        </div>
        <div className="divide-y divide-border/50">
          {list.map((c, i) => (
            <motion.div key={c.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5">
              <div className="flex items-center gap-4 mb-3">
                <div className={cn('w-14 h-14 rounded-full flex items-center justify-center text-3xl flex-shrink-0', c.bg)}>{c.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-semibold text-base">{c.name}</div>
                    <span className="text-xs text-muted-foreground">出现在 {c.appearsIn} 个镜头</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={c.score} className="flex-1 max-w-xs" indicatorClassName={cn('!bg-none', c.score >= 90 ? 'bg-green-500' : c.score >= 70 ? 'bg-yellow-500' : 'bg-red-500')} />
                    <div className={cn('text-sm font-bold', c.score >= 90 ? 'text-green-600' : c.score >= 70 ? 'text-yellow-600' : 'text-red-500')}>{c.score}</div>
                    {c.issues === 0 ? (
                      <Badge variant="success" className="ml-2">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> 无问题
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="ml-2">
                        <AlertTriangle className="w-3 h-3 mr-1" /> {c.issues} 个问题
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.issues > 0 && (
                    <Button size="sm" onClick={() => fixCharacter(i)}>
                      <Wrench className="w-3.5 h-3.5" /> 一键修复
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate('/video')}>
                    查看镜头
                  </Button>
                </div>
              </div>
              {c.issueDetails && (
                <div className="space-y-1.5 ml-18">
                  {c.issueDetails.map((d, di) => (
                    <div key={di} className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-50 border border-yellow-100 dark:bg-yellow-950/20 dark:border-yellow-900/30 text-xs">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <span className="flex-1 text-yellow-900 dark:text-yellow-200">{d}</span>
                      <button onClick={() => fixSingle(i, di)} className="text-brand-600 hover:underline text-xs">
                        修复
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}
