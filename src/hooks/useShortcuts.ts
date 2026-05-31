import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: () => void;
  group: string;
}

export function useShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      for (const s of shortcuts) {
        const ctrlOk = !s.ctrl || e.ctrlKey || e.metaKey;
        const shiftOk = s.shift === undefined || s.shift === e.shiftKey;
        const altOk = s.alt === undefined || s.alt === e.altKey;
        const keyMatch = s.key.toLowerCase() === e.key.toLowerCase();
        if (s.ctrl && !(e.ctrlKey || e.metaKey)) continue;
        if (!keyMatch || !ctrlOk || !shiftOk || !altOk) continue;
        if (isInput && !s.ctrl && s.key !== 'Escape') continue;
        e.preventDefault();
        s.handler();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

export const SHORTCUT_GROUPS = [
  {
    cat: '全局',
    items: [
      { keys: ['Ctrl', 'K'], desc: '打开搜索' },
      { keys: ['Ctrl', 'N'], desc: '新建项目' },
      { keys: ['Ctrl', 'S'], desc: '保存' },
      { keys: ['?'], desc: '显示快捷键面板' },
      { keys: ['Esc'], desc: '关闭弹窗/菜单' }
    ]
  },
  {
    cat: '视频编辑',
    items: [
      { keys: ['Space'], desc: '播放 / 暂停' },
      { keys: ['←', '→'], desc: '上一个/下一个分镜' },
      { keys: ['J'], desc: '后退 5 秒' },
      { keys: ['L'], desc: '前进 5 秒' },
      { keys: ['Ctrl', 'Z'], desc: '撤销' },
      { keys: ['Ctrl', 'Shift', 'Z'], desc: '重做' }
    ]
  },
  {
    cat: '剧本编辑',
    items: [
      { keys: ['Ctrl', 'B'], desc: '加粗' },
      { keys: ['Ctrl', 'I'], desc: '斜体' },
      { keys: ['Ctrl', '/'], desc: '添加分镜分隔符' },
      { keys: ['Tab'], desc: '缩进对白' }
    ]
  }
];

export function useGlobalShortcuts(opts: { onSearch: () => void; onNewProject: () => void; onShortcutsOverlay: () => void }) {
  const navigate = useNavigate();
  useShortcuts([
    { key: 'k', ctrl: true, description: '搜索', group: '全局', handler: opts.onSearch },
    { key: 'n', ctrl: true, description: '新建项目', group: '全局', handler: opts.onNewProject },
    { key: 's', ctrl: true, description: '保存', group: '全局', handler: () => toast.success('已保存') },
    { key: '?', description: '快捷键面板', group: '全局', handler: opts.onShortcutsOverlay },
    { key: '/', shift: true, description: '快捷键面板', group: '全局', handler: opts.onShortcutsOverlay },
    { key: 'h', ctrl: true, description: '回到工作台', group: '全局', handler: () => navigate('/home') }
  ]);
}
