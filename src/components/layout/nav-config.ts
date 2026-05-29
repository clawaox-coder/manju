import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Share2,
  Trash2,
  Pencil,
  LayoutGrid,
  UserCheck,
  Mic,
  Video,
  Scissors,
  Users,
  Image as ImageIcon,
  Boxes,
  Music,
  Volume2,
  Settings,
  CreditCard,
  Key,
  HelpCircle,
  Workflow,
  type LucideIcon
} from 'lucide-react';

export interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  dot?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: 'dashboard', to: '/', label: '工作台', icon: LayoutDashboard },
      { key: 'projects', to: '/projects', label: '项目管理', icon: FolderKanban },
      { key: 'drafts', to: '/drafts', label: '我的草稿', icon: FileText },
      { key: 'shared', to: '/shared', label: '与我分享', icon: Share2 },
      { key: 'trash', to: '/trash', label: '回收站', icon: Trash2 }
    ]
  },
  {
    label: 'AI 创作',
    items: [
      { key: 'script', to: '/script', label: '剧本创作', icon: Pencil, dot: true },
      { key: 'canvas', to: '/canvas', label: '创作画布', icon: Workflow },
      { key: 'storyboard', to: '/storyboard', label: 'AI 生成分镜', icon: LayoutGrid },
      { key: 'consistency', to: '/consistency', label: '角色一致性', icon: UserCheck },
      { key: 'voice', to: '/voice', label: '配音与对白', icon: Mic },
      { key: 'video', to: '/video', label: '视频生成', icon: Video },
      { key: 'edit', to: '/edit', label: '智能剪辑', icon: Scissors }
    ]
  },
  {
    label: '资产库',
    items: [
      { key: 'characters', to: '/characters', label: '角色库', icon: Users },
      { key: 'scenes', to: '/scenes', label: '场景库', icon: ImageIcon },
      { key: 'props', to: '/props', label: '道具库', icon: Boxes },
      { key: 'music', to: '/music', label: '音乐库', icon: Music },
      { key: 'sfx', to: '/sfx', label: '音效库', icon: Volume2 }
    ]
  }
];

export const ACCOUNT_NAV: NavItem[] = [
  { key: 'settings', to: '/settings', label: '个人设置', icon: Settings },
  { key: 'team', to: '/team', label: '团队管理', icon: Users },
  { key: 'billing', to: '/billing', label: '订阅与账单', icon: CreditCard },
  { key: 'apikeys', to: '/apikeys', label: 'API 密钥', icon: Key },
  { key: 'help', to: '/help', label: '帮助与快捷键', icon: HelpCircle }
];

export const TOP_NAV: NavItem[] = [
  { key: 'dashboard', to: '/', label: '工作台', icon: LayoutDashboard },
  { key: 'projects', to: '/projects', label: '项目', icon: FolderKanban },
  { key: 'characters', to: '/characters', label: '角色库', icon: Users },
  { key: 'storyboard', to: '/storyboard', label: '分镜', icon: LayoutGrid },
  { key: 'video', to: '/video', label: '视频生成', icon: Video },
  { key: 'team', to: '/team', label: '团队协作', icon: Users }
];
