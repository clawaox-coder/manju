import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { useMe } from '@/hooks/useAuthApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  User as UserIcon,
  SlidersHorizontal,
  Palette,
  Bell,
  Shield,
  Plug,
  Laptop,
  Smartphone,
  Monitor,
  Sparkles
} from 'lucide-react';

const TABS = [
  { key: 'profile', label: '个人资料', icon: UserIcon },
  { key: 'preferences', label: '偏好设置', icon: SlidersHorizontal },
  { key: 'appearance', label: '外观主题', icon: Palette },
  { key: 'notifications', label: '通知设置', icon: Bell },
  { key: 'security', label: '安全与登录', icon: Shield },
  { key: 'integrations', label: '集成与扩展', icon: Plug }
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Settings() {
  const [tab, setTab] = useState<TabKey>('profile');
  const { data: me } = useMe();
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const preferences = useStore((s) => s.preferences);
  const updatePreference = useStore((s) => s.updatePreference);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const notifPrefs = useStore((s) => s.notificationPrefs);
  const updateNotif = useStore((s) => s.updateNotificationPref);
  const confirm = useConfirm();

  const displayName = me?.user?.name ?? profile.name;
  const displayEmail = me?.user?.email ?? profile.email;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">设置</h1>
        <p className="text-xs text-muted-foreground mt-1">管理您的个人资料、偏好和团队配置</p>
      </div>
      <div className="flex gap-6">
        <aside className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition',
                    tab === t.key ? 'gradient-purple-soft text-brand-700 font-medium' : 'text-foreground/70 hover:bg-accent'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          {tab === 'profile' && (
            <Card className="p-6 space-y-5">
              <h2 className="font-semibold">个人资料</h2>
              <div className="flex items-center gap-5 pb-5 border-b border-border">
                <Avatar className="w-20 h-20">
                  <AvatarFallback className="bg-gradient-to-br from-pink-300 via-purple-300 to-indigo-400 text-white font-bold text-2xl">{profile.avatar}</AvatarFallback>
                </Avatar>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.info('请选择头像图片')}>
                    更换头像
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const opts = ['星', '月', '光', '梦', '彩', '艺', '创', '灵'];
                      updateProfile({ avatar: opts[Math.floor(Math.random() * opts.length)] });
                      toast.success('AI 已生成新头像');
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> AI 生成
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(['name', 'email', 'phone', 'bio'] as const).map((k) => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {k === 'name' ? '工作室名称' : k === 'email' ? '邮箱' : k === 'phone' ? '手机号' : '简介'}
                    </label>
                    <Input value={profile[k]} onChange={(e) => updateProfile({ [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline">取消</Button>
                <Button onClick={() => toast.success('个人资料已保存')}>保存修改</Button>
              </div>
            </Card>
          )}

          {tab === 'preferences' && (
            <Card className="p-6 space-y-5">
              <h2 className="font-semibold">偏好设置</h2>
              {([
                { key: 'lang', label: '界面语言', options: [['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語']] },
                { key: 'timezone', label: '时区', options: [['GMT+8 北京', 'GMT+8 北京'], ['GMT+9 东京', 'GMT+9 东京'], ['GMT-5 纽约', 'GMT-5 纽约'], ['GMT+0 伦敦', 'GMT+0 伦敦']] },
                { key: 'dateFormat', label: '日期格式', options: [['YYYY-MM-DD', 'YYYY-MM-DD'], ['YYYY/MM/DD', 'YYYY/MM/DD'], ['MM-DD-YYYY', 'MM-DD-YYYY']] }
              ] as const).map(({ key, label, options }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="text-sm font-medium">{label}</div>
                  <select
                    value={preferences[key]}
                    onChange={(e) => updatePreference(key, e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm bg-background"
                  >
                    {options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {([
                { key: 'autoSave', label: '自动保存', desc: '每 30 秒自动保存草稿' },
                { key: 'sendStats', label: '发送使用统计', desc: '帮助改进产品 (不含内容数据)' },
                { key: 'betaFeatures', label: 'Beta 测试功能', desc: '抢先体验未发布的功能 (可能不稳定)' }
              ] as const).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                  <Switch checked={preferences[key]} onCheckedChange={(v) => updatePreference(key, v)} />
                </div>
              ))}
            </Card>
          )}

          {tab === 'appearance' && (
            <div className="space-y-4">
              <Card className="p-6">
                <h2 className="font-semibold mb-5">主题</h2>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['light', '浅色', 'from-white to-gray-100'],
                    ['dark', '深色', 'from-gray-700 to-gray-900'],
                    ['auto', '跟随系统', 'from-white via-gray-200 to-gray-800']
                  ] as const).map(([key, label, grad]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTheme(key);
                        toast.success(`主题已切换为「${label}」`);
                      }}
                      className={cn('p-3 rounded-xl border-2 transition', theme === key ? 'border-brand-500' : 'border-border hover:border-muted-foreground/30')}
                    >
                      <div className={cn('aspect-video rounded-lg mb-2 bg-gradient-to-br border border-border', grad)} />
                      <div className="text-sm font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </Card>
              <Card className="p-6">
                <h2 className="font-semibold mb-5">界面密度</h2>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['compact', '紧凑', '节省屏幕空间'],
                    ['cozy', '舒适', '推荐, 平衡留白'],
                    ['comfortable', '宽松', '更易阅读']
                  ] as const).map(([key, label, desc]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setDensity(key);
                        toast.success('界面密度已更新');
                      }}
                      className={cn(
                        'p-3 rounded-xl border-2 text-left transition',
                        density === key ? 'border-brand-500 bg-brand-50/30' : 'border-border hover:border-muted-foreground/30'
                      )}
                    >
                      <div className="text-sm font-medium mb-0.5">{label}</div>
                      <div className="text-[11px] text-muted-foreground">{desc}</div>
                    </button>
                  ))}
                </div>
              </Card>
              <Card className="p-6">
                <h2 className="font-semibold mb-5">其他</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">字号</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">当前 {fontSize}px</div>
                  </div>
                  <Slider value={[fontSize]} min={12} max={20} step={1} onValueChange={(v) => setFontSize(v[0])} className="w-64" />
                </div>
              </Card>
            </div>
          )}

          {tab === 'notifications' && (
            <Card className="p-6 space-y-4">
              <h2 className="font-semibold">通知设置</h2>
              {([
                { key: 'renderDone', label: '渲染完成通知', desc: '视频生成完成时发送通知' },
                { key: 'teamMsg', label: '团队消息', desc: '团队成员评论或 @ 你时通知' },
                { key: 'weeklyDigest', label: '每周报告', desc: '每周一上午 9 点发送一周创作数据' },
                { key: 'marketing', label: '产品动态与营销', desc: '新功能、活动、优惠信息' }
              ] as const).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                  <Switch checked={notifPrefs[key]} onCheckedChange={() => updateNotif(key)} />
                </div>
              ))}
              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium mb-3">通知渠道</div>
                <div className="flex flex-wrap gap-2">
                  <Badge>站内 ✓</Badge>
                  <Badge>邮件 ✓</Badge>
                  <Badge variant="gray">+ 微信</Badge>
                  <Badge variant="gray">+ 钉钉</Badge>
                </div>
              </div>
            </Card>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              <Card className="p-6 space-y-3">
                <h2 className="font-semibold">密码与认证</h2>
                {[
                  { label: '登录密码', sub: '上次修改: 2026-02-14', action: '修改' },
                  { label: '两步验证', sub: '使用 TOTP / 短信', action: '关闭', badge: '已开启' },
                  { label: '备用恢复邮箱', sub: 'b***@xingchen.studio', action: '修改' }
                ].map((it) => (
                  <div key={it.label} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {it.label} {it.badge && <Badge variant="success">{it.badge}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{it.sub}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toast.info(it.action)}>
                      {it.action}
                    </Button>
                  </div>
                ))}
              </Card>
              <Card className="p-6">
                <h2 className="font-semibold mb-5">登录设备 (3)</h2>
                <div className="space-y-2">
                  {[
                    { Icon: Laptop, name: 'MacBook Pro · Chrome', loc: '北京', time: '当前会话', current: true },
                    { Icon: Smartphone, name: 'iPhone 15 · App', loc: '北京', time: '2 小时前' },
                    { Icon: Monitor, name: 'Windows PC · Edge', loc: '上海', time: '昨天' }
                  ].map((d) => (
                    <div key={d.name} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <d.Icon className="w-6 h-6 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium flex items-center gap-2">
                            {d.name} {d.current && <Badge variant="success">当前</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {d.loc} · {d.time}
                          </div>
                        </div>
                      </div>
                      {!d.current && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => toast.info('已强制下线')}>
                          下线
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6 border-red-200 dark:border-red-900/50">
                <h2 className="font-semibold mb-3 text-red-600">危险区域</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">注销账户</div>
                    <div className="text-xs text-muted-foreground mt-0.5">删除所有数据, 此操作不可恢复</div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      confirm({
                        title: '注销账户',
                        message: '注销后所有项目、草稿、共享将被永久删除, 此操作不可恢复, 确定吗?',
                        okText: '注销',
                        danger: true,
                        onConfirm: () => toast.warning('账户注销申请已提交')
                      })
                    }
                  >
                    注销账户
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {tab === 'integrations' && (
            <Card className="p-6">
              <h2 className="font-semibold mb-5">已连接的服务</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: '抖音创作者', desc: '一键发布视频', icon: '🎵', connected: true },
                  { name: 'B站', desc: '同步到 Bilibili', icon: '📺', connected: true },
                  { name: '微信视频号', desc: '分发到视频号', icon: '💬', connected: false },
                  { name: 'YouTube', desc: '国际版分发', icon: '▶️', connected: false },
                  { name: '飞书', desc: '团队消息通知', icon: '🚀', connected: true },
                  { name: 'OBS Studio', desc: '直播推流', icon: '📡', connected: false }
                ].map((s) => (
                  <div key={s.name} className="p-4 rounded-xl border border-border flex items-center gap-3">
                    <div className="text-3xl">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                    {s.connected ? (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => toast.info(`已断开 ${s.name}`)}>
                        已连接
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => toast.info(`正在跳转授权 ${s.name}...`)}>
                        连接
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
