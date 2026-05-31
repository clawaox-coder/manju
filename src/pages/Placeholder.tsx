import { useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';

const NAMES: Record<string, string> = {
  '/': '工作台',
  '/projects': '项目管理',
  '/drafts': '我的草稿',
  '/shared': '与我分享',
  '/trash': '回收站',
  '/script': '剧本创作',
  '/storyboard': 'AI 生成分镜',
  '/consistency': '角色一致性',
  '/voice': '配音与对白',
  '/video': '视频生成',
  '/edit': '智能剪辑',
  '/characters': '角色库',
  '/scenes': '场景库',
  '/props': '道具库',
  '/music': '音乐库',
  '/sfx': '音效库',
  '/settings': '个人设置',
  '/team': '团队管理',
  '/billing': '订阅与账单',
  '/apikeys': 'API 密钥',
  '/help': '帮助中心'
};

export default function PlaceholderPage() {
  const loc = useLocation();
  const name = NAMES[loc.pathname] || '页面';
  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="text-xs text-muted-foreground mt-1">即将上线</p>
      </div>
      <div className="bg-card rounded-2xl p-16 flex flex-col items-center justify-center text-center border border-border">
        <div className="w-16 h-16 rounded-2xl gradient-brand-soft flex items-center justify-center mb-4">
          <Wrench className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-semibold text-base mb-2">{name} · 开发中</h2>
        <p className="text-xs text-muted-foreground max-w-sm">该页面正在精细打磨, 将在后续 Phase 中逐步完成。</p>
      </div>
    </div>
  );
}
