import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProjects } from '@/hooks/useProjectApi';
import { useTeamMembers } from '@/hooks/useAuthApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Plan {
  key: string;
  name: string;
  price: string;
  period: string;
  features: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  { key: 'free', name: '免费版', price: '¥0', period: '永久', features: ['每月 5 次渲染', '5 GB 存储', '基础模板', '社区支持'] },
  { key: 'pro', name: '专业版', price: '¥99', period: '每月', features: ['每月 50 次渲染', '50 GB 存储', '全部模板', '4K 输出', '优先支持'], popular: true },
  { key: 'team', name: '团队版', price: '¥599', period: '每月', features: ['每月 120 次渲染', '200 GB 存储', '10 个成员席位', 'API 访问', 'SLA 保证', '专属客服'] },
  { key: 'enterprise', name: '企业版', price: '联系销售', period: '定制', features: ['无限渲染', '无限存储', '无限席位', '私有部署', '审计日志', '定制开发'] }
];

export default function Billing() {
  const { data: projectsData } = useProjects({ pageSize: 100 });
  const { data: teamMembers = [] } = useTeamMembers();
  const confirm = useConfirm();
  const [plan, setPlan] = useState('team');
  const current = PLANS.find((p) => p.key === plan) || PLANS[2];
  const [autoRenew, setAutoRenew] = useState(true);

  const projectCount = projectsData?.data?.length ?? 0;
  const memberCount = teamMembers.length;

  const usage = [
    { key: 'render', label: '视频渲染', used: projectCount, total: plan === 'free' ? 5 : plan === 'pro' ? 50 : 120, unit: '次' },
    { key: 'storage', label: '云端存储', used: 0, total: plan === 'free' ? 5 : plan === 'pro' ? 50 : 200, unit: 'GB' },
    { key: 'seat', label: '团队席位', used: memberCount, total: plan === 'free' ? 1 : plan === 'pro' ? 3 : 10, unit: '人' },
    { key: 'ai', label: 'AI Token', used: 0, total: plan === 'free' ? 1000 : plan === 'pro' ? 50000 : 200000, unit: '次' },
  ];

  function switchPlan(target: string) {
    const old = PLANS.find((p) => p.key === plan)!;
    const next = PLANS.find((p) => p.key === target)!;
    const isUpgrade = PLANS.findIndex((p) => p.key === target) > PLANS.findIndex((p) => p.key === plan);
    confirm({
      title: isUpgrade ? '升级套餐' : '降级套餐',
      message: `确定从「${old.name}」${isUpgrade ? '升级' : '降级'}到「${next.name}」? ${isUpgrade ? `将立即扣款 ${next.price}` : '在当前周期结束后生效'}`,
      okText: isUpgrade ? '立即升级' : '确认降级',
      danger: false,
      onConfirm: () => {
        setPlan(target);
        toast.success(`已${isUpgrade ? '升级到' : '降级到'}「${next.name}」`);
      }
    });
  }


  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">订阅与账单</h1>
        <p className="text-xs text-muted-foreground mt-1">管理您的订阅、查看用量和账单历史</p>
      </div>

      {/* Current plan */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg p-6 mb-4 text-primary-foreground relative overflow-hidden bg-foreground"
      >
        <div className="relative">
          <div className="text-xs opacity-80 mb-1">当前套餐</div>
          <div className="flex items-end gap-3 mb-2">
            <div className="text-3xl font-bold">{current.name}</div>
            <div className="text-sm opacity-80 pb-1">
              {current.price} / {current.period}
            </div>
          </div>
          <div className="text-xs opacity-80 mb-4">当前周期 {autoRenew && '· 自动续费已开启'}</div>
          <div className="flex gap-2">
            <Button className="bg-background text-foreground hover:bg-background/90 shadow-none" onClick={() => document.getElementById('plansGrid')?.scrollIntoView({ behavior: 'smooth' })}>
              升级套餐
            </Button>
            <Button
              className="bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 shadow-none"
              onClick={() => {
                setAutoRenew((v) => !v);
                toast.success(`自动续费已${!autoRenew ? '开启' : '关闭'}`);
              }}
            >
              {autoRenew ? '关闭自动续费' : '开启自动续费'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Usage */}
      <Card className="p-5 mb-4">
        <h2 className="font-semibold mb-4">本月用量</h2>
        <div className="grid grid-cols-4 gap-4">
          {usage.map((u) => {
            const pct = u.total > 0 ? Math.round((u.used / u.total) * 100) : 0;
            const color = pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'brand';
            return (
              <div key={u.key}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="text-xs text-muted-foreground">{u.label}</div>
                  <div className={cn('text-[10px]', `text-${color}-600`)}>{pct}%</div>
                </div>
                <div className="text-lg font-bold mb-2">
                  {u.used.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">/ {u.total.toLocaleString()} {u.unit}</span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Plans */}
      <Card id="plansGrid" className="p-5 mb-4">
        <h2 className="font-semibold mb-4">套餐对比</h2>
        <div className="grid grid-cols-4 gap-3">
          {PLANS.map((p) => {
            const isCurrent = p.key === plan;
            return (
              <div
                key={p.key}
                className={cn(
                  'relative p-5 rounded-xl border-2',
                  isCurrent ? 'border-foreground bg-accent' : p.popular ? 'border-pink-300 ring-4 ring-pink-100 dark:ring-pink-950/30' : 'border-border'
                )}
              >
                {p.popular && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-pink-500 text-white">热门</Badge>}
                {isCurrent && <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">当前</Badge>}
                <div className="text-base font-bold mb-1">{p.name}</div>
                <div className="text-2xl font-bold mb-1">{p.price}</div>
                <div className="text-xs text-muted-foreground mb-4">{p.period}</div>
                <ul className="space-y-2 mb-5 text-xs">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button disabled variant="secondary" className="w-full">
                    当前使用
                  </Button>
                ) : p.key === 'enterprise' ? (
                  <Button variant="outline" className="w-full" onClick={() => toast.success('销售经理将在 1 工作日内联系您')}>
                    联系销售
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => switchPlan(p.key)}>
                    {PLANS.findIndex((x) => x.key === p.key) < PLANS.findIndex((x) => x.key === plan) ? '降级' : '升级'}至 {p.name}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Invoices */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">账单历史</h2>
          <button onClick={() => toast.success('已导出全部账单')} className="text-xs text-primary hover:underline">
            导出全部
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">账单号</th>
              <th className="px-5 py-3 text-left font-medium">日期</th>
              <th className="px-5 py-3 text-left font-medium">套餐</th>
              <th className="px-5 py-3 text-left font-medium">金额</th>
              <th className="px-5 py-3 text-left font-medium">状态</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">暂无账单记录</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
