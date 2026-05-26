import { useEffect } from 'react';
import { useStore } from '@/store';

export function useTheme() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
    const mql = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'auto' && mql.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    if (theme === 'auto') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [theme]);

  return { theme, setTheme };
}
