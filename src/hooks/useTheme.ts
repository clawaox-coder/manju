import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import type { Theme } from '@/types';

const mql = () => matchMedia('(prefers-color-scheme: dark)');

/** 由主题状态推导有效明暗(reactive):auto 跟随系统偏好并监听其变化。 */
export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() => mql().matches);

  useEffect(() => {
    if (theme !== 'auto') return;
    const m = mql();
    const onChange = () => setSystemDark(m.matches);
    setSystemDark(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [theme]);

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
