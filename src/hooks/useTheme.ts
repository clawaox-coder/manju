import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '@/store';
import type { Theme } from '@/types';

const mql = () => matchMedia('(prefers-color-scheme: dark)');

// 系统深色偏好是浏览器侧的外部可变源:用 useSyncExternalStore 订阅,
// 避免在 effect 内同步 setState 触发级联渲染(react-hooks/set-state-in-effect)。
function subscribeSystemDark(onChange: () => void): () => void {
  const m = mql();
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

const getSystemDark = (): boolean => mql().matches;

/** 由主题状态推导有效明暗(reactive):auto 跟随系统偏好并监听其变化。 */
export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useStore((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark);

  return theme === 'dark' || (theme === 'auto' && systemDark) ? 'dark' : 'light';
}

/**
 * 主题投射的单一真相源:把有效明暗投射为 <html> 的 .dark class。
 * 全局仅在 App 挂载一次;其余组件如需有效主题请用 useEffectiveTheme()。
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; effectiveTheme: 'light' | 'dark' } {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const effectiveTheme = useEffectiveTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
  }, [effectiveTheme]);

  return { theme, setTheme, effectiveTheme };
}
