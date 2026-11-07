import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './use-theme';

const KEY = 'hammerline-theme';

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Dark (the brand's black and gold) by default; the choice is remembered per browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b0b0d' : '#f6f3ec');
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // private mode: the theme just is not remembered
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
